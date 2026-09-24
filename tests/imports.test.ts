import { videoFixture } from './fixtures/mp4';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
vi.mock('server-only', () => ({}));
const state = vi.hoisted(() => ({
  row: {
    id: 'draft',
    agent_id: 'agent',
    caption: '',
    magic_used_at: null,
    content_id: null,
  } as Record<string, unknown>,
  stored: null as Uint8Array<ArrayBufferLike> | null,
  text: vi.fn(),
  connection: null as Record<string, unknown> | null,
  rpc: vi.fn(),
  foreign: false,
}));
vi.mock('@/lib/ai/service', () => ({
  AIService: class {
    text = state.text;
  },
}));
vi.mock('@/lib/supabase/server', () => ({ adminClient: () => database }));
const database = {
  from: (table: string) => {
    let update: Record<string, unknown> | undefined;
    let claim = false;
    const q: Record<string, unknown> = {};
    q.select = q.eq = () => q;
    q.is = (name: string) => {
      if (name === 'magic_used_at') claim = true;
      return q;
    };
    q.insert = q.update = (value: Record<string, unknown>) => {
      update = value;
      return q;
    };
    const resolve = () => {
      if (table === 'agents') return { data: state.foreign ? null : { id: 'agent' }, error: null };
      if (table === 'social_connections') return { data: state.connection, error: null };
      if (claim && state.row.magic_used_at) return { data: null, error: null };
      if (update) state.row = { ...state.row, ...update };
      return { data: state.row, error: null };
    };
    q.single = q.maybeSingle = async () => resolve();
    q.then = (accept: (v: unknown) => void) => accept(resolve());
    return q;
  },
  storage: {
    from: () => ({
      upload: async (_path: string, bytes: Uint8Array<ArrayBufferLike>) => {
        state.stored = bytes;
        return { data: {}, error: null };
      },
      remove: vi.fn(),
    }),
  },
  rpc: state.rpc,
};
import { uploadImport, finalizeImport, signedImport } from '@/features/imports/service';
import { importImages } from '@/features/imports/images';
const ctx = {
  db: database,
  user: { id: 'user' },
  workspaceId: 'workspace',
  role: 'ADMIN',
} as unknown as Parameters<typeof uploadImport>[0];
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('Network forbidden in unit test');
    }),
  );
  state.row = {
    id: 'draft',
    agent_id: 'agent',
    caption: '',
    magic_used_at: null,
    content_id: null,
  };
  state.text.mockReset().mockResolvedValue({ caption: 'Legenda aprimorada' });
  state.rpc.mockReset().mockResolvedValue({data:'reservation',error:null});
  state.foreign = false;
  state.connection = null;
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
it('uploads original bytes and preserves aspect ratio without image AI', async () => {
  const bytes = await sharp({
    create: { width: 720, height: 1280, channels: 3, background: 'blue' },
  })
    .jpeg()
    .toBuffer();
  const row = await uploadImport(
    ctx,
    'agent',
    new File([new Uint8Array(bytes)], 'input.jpg', { type: 'image/jpeg' }),
  );
  expect(Buffer.from(state.stored!).equals(bytes)).toBe(true);
  expect(row).toMatchObject({ width: 720, height: 1280, mime_type: 'image/jpeg' });
  expect(state.text).not.toHaveBeenCalled();
});
it('rejects non-image input and agents outside the workspace', async () => {
  await expect(
    uploadImport(ctx, 'agent', new File(['pdf'], 'x.pdf', { type: 'application/pdf' })),
  ).rejects.toThrow('invalid_input');
  state.foreign = true;
  await expect(
    uploadImport(ctx, 'foreign', new File(['data'], 'x.jpg', { type: 'image/jpeg' })),
  ).rejects.toThrow('forbidden');
});
it.each(['publish', 'schedule'] as const)(
  'blocks %s without a capable connected account',
  async (action) => {
    await expect(
      finalizeImport(ctx, 'draft', { action, caption: 'Legenda', channel: 'instagram' }),
    ).rejects.toThrow('official_integration_required');
    state.connection = {
      id: 'connection',
      channel: 'instagram',
      metadata: { connected_via: 'demo' },
    };
    await expect(
      finalizeImport(ctx, 'draft', {
        action,
        caption: 'Legenda',
        channel: 'instagram',
        connection_id: 'connection',
      }),
    ).rejects.toThrow('official_integration_required');
    expect(state.rpc).not.toHaveBeenCalled();
  },
);
it.each([2, 6])('keeps %i original images ordered in one import without AI', async (count) => {
  const files = await Promise.all(
    Array.from(
      { length: count },
      async (_, index) =>
        new File(
          [
            new Uint8Array(
              await sharp({
                create: { width: 100 + index, height: 200, channels: 3, background: 'blue' },
              })
                .png()
                .toBuffer(),
            ),
          ],
          `slide-${index}.png`,
          { type: 'image/png' },
        ),
    ),
  );
  const result = await uploadImport(ctx, 'agent', files);
  const images = importImages(result);
  expect(images).toHaveLength(count);
  expect(images.map((image) => image.width)).toEqual(
    Array.from({ length: count }, (_, index) => 100 + index),
  );
  expect(images[0].storage_path).toBe(result.storage_path);
  expect(images[count - 1].storage_path).toContain(`/slide-${count}.png`);
  expect(state.text).not.toHaveBeenCalled();
  const sign = vi.fn(async (path: string) => ({
    data: { signedUrl: `signed:${path}` },
    error: null,
  }));
  const signed = await signedImport(
    {
      ...ctx,
      db: { storage: { from: () => ({ createSignedUrl: sign }) } },
    } as unknown as typeof ctx,
    result,
  );
  expect(signed.images.map((image) => image.url)).toEqual(
    images.map((image) => `signed:${image.storage_path}`),
  );
  expect(signed.url).toBe(signed.images[0].url);
});
it('rejects zero/seven files and validates the entire batch before storing anything', async () => {
  const file = new File(['invalid'], 'x.png', { type: 'image/png' });
  await expect(uploadImport(ctx, 'agent', [])).rejects.toThrow('1 a 6');
  await expect(uploadImport(ctx, 'agent', Array(7).fill(file))).rejects.toThrow('1 a 6');
  state.stored = null;
  const bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'red' } })
    .png()
    .toBuffer();
  await expect(
    uploadImport(ctx, 'agent', [
      new File([new Uint8Array(bytes)], 'valid.png', { type: 'image/png' }),
      file,
    ]),
  ).rejects.toThrow();
  expect(state.stored).toBeNull();
});

describe('Mandatory Audit Scenarios (1 to 6 images, limits, formats)', () => {
  // Scenarios 1 to 6: 1, 2, 3, 4, 5, 6 valid images
  it.each([1, 2, 3, 4, 5, 6])('successfully uploads and orders %i valid images', async (count) => {
    const files = await Promise.all(
      Array.from({ length: count }, async (_, index) => {
        const format = index % 3 === 0 ? 'jpeg' : index % 3 === 1 ? 'png' : 'webp';
        const mime = format === 'jpeg' ? 'image/jpeg' : format === 'png' ? 'image/png' : 'image/webp';
        const instance = sharp({
          create: { width: 400 + index * 20, height: 300 + index * 10, channels: 3, background: 'red' },
        });
        const buffer = format === 'jpeg' ? await instance.jpeg().toBuffer() : format === 'png' ? await instance.png().toBuffer() : await instance.webp().toBuffer();
        return new File([new Uint8Array(buffer)], `test-${index + 1}.${format === 'jpeg' ? 'jpg' : format}`, { type: mime });
      }),
    );

    const result = await uploadImport(ctx, 'agent', files);
    const images = importImages(result);

    expect(images).toHaveLength(count);
    // Verify strict order preservation
    for (let i = 0; i < count; i++) {
      expect(images[i].width).toBe(400 + i * 20);
      expect(images[i].height).toBe(300 + i * 10);
      if (i === 0) {
        expect(images[0].storage_path).toBe(result.storage_path);
        expect(images[0].storage_path).toContain('/original.');
      } else {
        expect(images[i].storage_path).toContain(`/slide-${i + 1}.`);
      }
    }
  });

  // Scenario 7: More than 6 images
  it('rejects attempt with more than 6 images (> 6)', async () => {
    const bytes = await sharp({ create: { width: 50, height: 50, channels: 3, background: 'blue' } })
      .png()
      .toBuffer();
    const files = Array.from(
      { length: 7 },
      (_, i) => new File([new Uint8Array(bytes)], `slide-${i}.png`, { type: 'image/png' }),
    );
    await expect(uploadImport(ctx, 'agent', files)).rejects.toThrow('1 a 6');
  });

  // Scenario 8: File larger than 10 MB
  it('rejects file larger than 10 MB with file_too_large (413)', async () => {
    // Create a mock File with size 10MB + 1
    const oversizedFile = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(oversizedFile, 'size', { value: 10 * 1024 * 1024 + 1 });

    await expect(uploadImport(ctx, 'agent', [oversizedFile])).rejects.toMatchObject({
      code: 'file_too_large',
      status: 413,
    });
  });

  // Scenario 9: Invalid format (e.g. PDF, TXT, SVG or corrupt)
  it('rejects invalid format (non-allowed MIME type or bad signature)', async () => {
    const textFile = new File(['hello text'], 'test.txt', { type: 'text/plain' });
    await expect(uploadImport(ctx, 'agent', [textFile])).rejects.toMatchObject({
      code: 'invalid_input',
    });

    const fakeJpg = new File([new Uint8Array([0, 1, 2, 3, 4])], 'fake.jpg', { type: 'image/jpeg' });
    await expect(uploadImport(ctx, 'agent', [fakeJpg])).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  // Scenario 10: Combination of valid and invalid files
  it('rejects combination of valid and invalid files atomically without storing anything', async () => {
    state.stored = null;
    const validBytes = await sharp({ create: { width: 100, height: 100, channels: 3, background: 'green' } })
      .png()
      .toBuffer();
    const validFile = new File([new Uint8Array(validBytes)], 'valid.png', { type: 'image/png' });
    const invalidFile = new File(['not an image'], 'corrupt.jpg', { type: 'image/jpeg' });

    await expect(uploadImport(ctx, 'agent', [validFile, invalidFile])).rejects.toMatchObject({
      code: 'invalid_input',
    });
    expect(state.stored).toBeNull();
  });

  // Special test: WebP with binary byte >= 128 in length field (the bug we resolved)
  it('successfully validates WebP images with high-bit bytes in file size', async () => {
    // WebP image
    const webpBuffer = await sharp({ create: { width: 350, height: 350, channels: 3, background: 'yellow' } })
      .webp()
      .toBuffer();
    const file = new File([new Uint8Array(webpBuffer)], 'test.webp', { type: 'image/webp' });

    const result = await uploadImport(ctx, 'agent', [file]);
    expect(result.mime_type).toBe('image/webp');
    expect(result.width).toBe(350);
  });

  // Special test: Normalizes image/jpg and image/pjpeg MIME variants
  it('accepts image/jpg and image/pjpeg Windows MIME variants and normalizes to image/jpeg', async () => {
    const jpgBytes = await sharp({ create: { width: 200, height: 200, channels: 3, background: 'cyan' } })
      .jpeg()
      .toBuffer();
    const file = new File([new Uint8Array(jpgBytes)], 'photo.jpg', { type: 'image/jpg' });

    const result = await uploadImport(ctx, 'agent', [file]);
    expect(result.mime_type).toBe('image/jpeg');
    expect(result.storage_path).toMatch(/\.jpg$/);
  });

  it('uses the real image format when the filename and declared MIME are incorrect', async () => {
    const jpegBytes = await sharp({
      create: { width: 320, height: 480, channels: 3, background: 'magenta' },
    })
      .jpeg()
      .toBuffer();
    const mislabeledFile = new File([new Uint8Array(jpegBytes)], 'photo.png', {
      type: 'image/png',
    });

    const result = await uploadImport(ctx, 'agent', [mislabeledFile]);

    expect(result.mime_type).toBe('image/jpeg');
    expect(result.storage_path).toMatch(/\.jpg$/);
    expect(result.width).toBe(320);
    expect(result.height).toBe(480);
  });
});

it('accepts a single original MP4 and enforces the 500 MB boundary before reading oversized data',async()=>{
 const bytes=videoFixture();
 const file=new File([new Uint8Array(bytes)],'clip.mp4',{type:'video/mp4'});
 const result=await uploadImport(ctx,'agent',file);
 expect(result.mime_type).toBe('video/mp4');expect(result.width).toBe(1080);expect(result.height).toBe(1920);
 expect(Buffer.from(state.stored!)).toEqual(bytes);
 // Size-only test doubles exercise the boundary without allocating 500 MB.
 Object.defineProperty(file,'size',{value:500*1024*1024,configurable:true});
 await expect(uploadImport(ctx,'agent',file)).resolves.toBeTruthy();
 Object.defineProperty(file,'size',{value:500*1024*1024+1});
 await expect(uploadImport(ctx,'agent',file)).rejects.toThrow('file_too_large');
 await expect(uploadImport(ctx,'agent',[new File([bytes],'clip.mp4',{type:'video/mp4'}),new File([bytes],'clip2.mp4',{type:'video/mp4'})])).rejects.toThrow('apenas um vídeo');
});
it('rejects unsupported video destinations on the server before creating content',async()=>{
 state.row={...state.row,mime_type:'video/mp4'};
 state.connection={channel:'facebook',metadata:{connected_via:'meta_oauth_official'}};
 await expect(finalizeImport(ctx,'draft',{caption:'Video caption',channel:'facebook',action:'publish',connection_id:'account',destination:'feed'})).rejects.toThrow('unsupported_capability');
 expect(state.rpc).not.toHaveBeenCalled();
 state.connection={channel:'instagram',metadata:{connected_via:'meta_oauth_official',account_type:'MEDIA_CREATOR'}};
 await expect(finalizeImport(ctx,'draft',{caption:'Video caption',channel:'instagram',action:'schedule',connection_id:'account',destination:'stories',scheduled_at:'2099-01-01T12:00:00Z'})).rejects.toThrow('unsupported_capability');
});

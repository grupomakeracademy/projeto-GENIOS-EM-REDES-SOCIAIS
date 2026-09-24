export function videoFixture(width=1080,height=1920,rotate=false) {
 const box=(type:string,data:Buffer)=>{const b=Buffer.alloc(8+data.length);b.writeUInt32BE(b.length);b.write(type,4);data.copy(b,8);return b;};
 const header=Buffer.alloc(84);header.writeUInt32BE(width*65536,76);header.writeUInt32BE(height*65536,80);
 header.writeInt32BE(rotate?0:65536,40);header.writeInt32BE(rotate?65536:0,44);header.writeInt32BE(rotate?0:65536,56);
 const handler=Buffer.alloc(12);handler.write('vide',8);
 return Buffer.concat([box('ftyp',Buffer.from('isom0000mp42')),box('moov',box('trak',Buffer.concat([box('tkhd',header),box('mdia',box('hdlr',handler))]))),box('mdat',Buffer.from([1]))]);
}

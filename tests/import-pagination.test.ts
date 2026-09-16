import {expect,it} from 'vitest';
import {pageBlock} from '@/features/library/pagination';
it.each([[1,240,[1,2,3,4,5]],[5,240,[1,2,3,4,5]],[6,240,[6,7,8,9,10]],[10,264,[6,7,8,9,10]],[11,264,[11]],[1,25,[1,2]],[1,24,[1]],[1,0,[]]])('shows the correct block at page %i for %i items',(page,total,pages)=>expect(pageBlock(page as number,total as number)).toEqual(pages));

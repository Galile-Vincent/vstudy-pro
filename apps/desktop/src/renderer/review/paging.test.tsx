// @vitest-environment jsdom
import { afterEach,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,act } from '@testing-library/react';
import {useReviewPage,type Cursor,type Page} from './paging';
afterEach(cleanup);
function Fixture({load}:{load:(cursor?:Cursor)=>Promise<Page<string>>}) {const page=useReviewPage(load);return <><p>{page.items.join(',')}</p><button onClick={page.more}>More</button></>;}
it('passes the keyset cursor and appends the next page',async()=>{
 const cursor={at:'2026-11-06T00:00:00Z',id:'a'};
 const load=vi.fn().mockResolvedValueOnce({items:['first'],nextCursor:cursor}).mockResolvedValueOnce({items:['second'],nextCursor:null});
 render(<Fixture load={load}/>);await screen.findByText('first');fireEvent.click(screen.getByText('More'));
 await screen.findByText('first,second');expect(load).toHaveBeenLastCalledWith(cursor);
});
it('ignores a late response from the previous course',async()=>{
 let resolve!:(page:Page<string>)=>void;const old=()=>new Promise<Page<string>>(r=>{resolve=r;});
 const view=render(<Fixture load={old}/>);view.rerender(<Fixture load={async()=>({items:['new course'],nextCursor:null})}/>);
 await screen.findByText('new course');await act(async()=>resolve({items:['old course'],nextCursor:null}));expect(screen.queryByText('old course')).toBeNull();
});

import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { useLearningRecords } from './useLearningRecords';
const profiles = vi.hoisted(() => ({ current:'a' }));
vi.mock('@/lib/current-learner',()=>({loadLearners:async()=>[{id:'a',name:'甲'},{id:'b',name:'乙'}],selectedLearner:(list: {id:string}[])=>list.find(l=>l.id===profiles.current)}));
beforeEach(()=>{profiles.current='a';});
afterEach(()=>vi.unstubAllGlobals());
describe('record requests',()=>{
  it('ignores an old child response and resets visible data while loading',async()=>{
    const pending: Array<() => void> = [];
    vi.stubGlobal('fetch',vi.fn((url:string)=>url.includes('learnerId=a') ? new Promise(resolve=>pending.push(()=>resolve(new Response(JSON.stringify(url.includes('/sessions') ? [] : {owner:'a'}))))) : Promise.resolve(new Response(JSON.stringify(url.includes('/sessions') ? [] : {owner:'b'})))));
    const {result}=renderHook(()=>useLearningRecords());
    await waitFor(()=>expect(pending).toHaveLength(3));
    act(()=>{profiles.current='b';window.dispatchEvent(new Event('eduagent:learner-change'));});
    await waitFor(()=>expect(result.current.data?.learnerId).toBe('b'));
    await act(async()=>{pending.forEach(f=>f());});
    expect(result.current.data?.learnerId).toBe('b');
  });
  it('surfaces failures and retries; explicit lesson child wins over current selection',async()=>{
    let fail=true;
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(fail?'{}':JSON.stringify(url.includes('/sessions')?[]:{}),{status:fail?503:200})));
    const {result}=renderHook(()=>useLearningRecords('b'));
    await waitFor(()=>expect(result.current.error).toBe(true));
    expect(result.current.data).toBeNull();fail=false;
    act(()=>result.current.reload());
    await waitFor(()=>expect(result.current.data?.learnerId).toBe('b'));
    expect(result.current.data?.name).toBe('乙');
    expect(fetch).toHaveBeenCalledWith('/api/sessions?learnerId=b&limit=50');
  });
});

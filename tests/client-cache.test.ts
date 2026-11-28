import test from "node:test";
import assert from "node:assert/strict";
import { cacheKeys, cacheTimes, createClientCache, invalidateRecords } from "../lib/client-cache.ts";

test("navigation reuses fresh results and concurrent readers share one request", async t => {
  const client = createClientCache(); t.after(() => client.clear());
  const key = [...cacheKeys.records("user-a", "tenant-a", "people"), {page:1,q:""}];
  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const queryFn = async () => { requests++; await gate; return ["resident"]; };
  const first = client.fetchQuery({queryKey:key,queryFn});
  const second = client.fetchQuery({queryKey:key,queryFn});
  release();
  assert.deepEqual(await first, ["resident"]); await second;
  await client.fetchQuery({queryKey:key,queryFn});
  assert.equal(requests, 1);
});

test("stale results are refreshed while fresh cached results avoid a request", async t => {
  const client = createClientCache(); t.after(() => client.clear());
  const key = cacheKeys.account("user-a");
  client.setQueryData(key, "cached", {updatedAt:Date.now()-cacheTimes.account-1});
  let requests = 0;
  const options = {queryKey:key,staleTime:cacheTimes.account,queryFn:async()=>{requests++;return "current";}};
  assert.equal(await client.fetchQuery(options), "current");
  assert.equal(await client.fetchQuery(options), "current");
  assert.equal(requests, 1);
});

test("users, neighborhoods, filters and pages have isolated cache entries", t => {
  const client = createClientCache(); t.after(() => client.clear());
  const key = [...cacheKeys.records("user-a","tenant-a","people"), {page:1,q:"Andi"}];
  client.setQueryData(key, ["private resident"]);
  for (const other of [
    [...cacheKeys.records("user-b","tenant-a","people"), {page:1,q:"Andi"}],
    [...cacheKeys.records("user-a","tenant-b","people"), {page:1,q:"Andi"}],
    [...cacheKeys.records("user-a","tenant-a","people"), {page:2,q:"Andi"}],
    [...cacheKeys.records("user-a","tenant-a","people"), {page:1,q:"Dewi"}],
  ]) assert.equal(client.getQueryData(other), undefined);
  client.setQueryData(cacheKeys.resident("user-a","tenant-a"), ["private profile"]);
  assert.equal(client.getQueryData(cacheKeys.resident("user-b","tenant-a")), undefined);
  assert.equal(client.getQueryData(cacheKeys.resident("user-a","tenant-b")), undefined);
});

test("cluster changes invalidate their dependent lists and summary without touching documents or other accounts", async t => {
  const client = createClientCache(); t.after(() => client.clear());
  const affected = [cacheKeys.records("a","one","clusters"),cacheKeys.records("a","one","units"),cacheKeys.summary("a","one"),cacheKeys.resident("a","one")];
  const unaffected = [cacheKeys.records("a","one","people"),cacheKeys.documents("a"),cacheKeys.account("a"),cacheKeys.records("b","one","clusters"),cacheKeys.records("a","two","clusters")];
  for (const key of [...affected,...unaffected]) client.setQueryData(key, []);
  await invalidateRecords(client,"a","one","clusters");
  for (const key of affected) assert.equal(client.getQueryState(key)?.isInvalidated, true);
  for (const key of unaffected) assert.equal(client.getQueryState(key)?.isInvalidated, false);
});

test("clearing the cache cancels pending reads and late responses cannot restore private data", async t => {
  const client = createClientCache(); t.after(() => client.clear());
  const key = cacheKeys.documents("a");
  let release!: (value:string[]) => void;
  let aborted = false;
  const pending = client.fetchQuery({queryKey:key,queryFn:({signal})=>{
    signal.addEventListener("abort",()=>{aborted=true;});
    return new Promise<string[]>(resolve=>{release=resolve;});
  }});
  const rejected = assert.rejects(pending);
  client.setQueryData(cacheKeys.account("a"), {name:"Private account"});
  client.clear();
  release(["late private document"]);
  await rejected;
  assert.equal(aborted, true);
  assert.equal(client.getQueryCache().getAll().length, 0);
});

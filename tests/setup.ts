// PouchDB probes Blob support by storing a Blob in IndexedDB. fake-indexeddb aborts that transaction on
// Node 20 (the release workflow's version), which breaks every database call. Lemma stores no attachments.
if (Number(process.versions.node.split('.')[0]) < 22) {
    Reflect.deleteProperty(globalThis, 'Blob');
}

// jsdom 没实现媒体播放，会往控制台刷 "Not implemented"；测试里只需要一个能 resolve 的 play。
if (typeof HTMLMediaElement !== 'undefined') {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => undefined;
}

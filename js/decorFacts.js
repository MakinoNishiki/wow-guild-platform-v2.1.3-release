// See REQ-209 verification for provenance. Unknown values remain absent.
window.DecorFacts = (() => {
  const patches = new Map();
  for (const [version, records] of Object.entries(window.DecorIntroducedPatches)) {
    for (const id of records) patches.set(id, version);
  }
  const builds = new Map([[2105, 64632], [8236, 64632], [9472, 64632]]);
  function get(id) {
    const abilities = [...(window.DecorUseFacts?.get(id) || [])];
    if (window.DecorEffectIds?.has(id)) abilities.push('effect');
    return { patch: patches.get(id), build: builds.get(id), abilities };
  }
  return { get };
})();

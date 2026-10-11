// Temps réel via Server-Sent Events : un ou plusieurs flux ouverts par utilisateur connecté.
const streams = new Map(); // userId -> Set<res>

function subscribe(userId, res) {
  if (!streams.has(userId)) streams.set(userId, new Set());
  streams.get(userId).add(res);
  return () => {
    streams.get(userId)?.delete(res);
    if (streams.get(userId)?.size === 0) streams.delete(userId);
  };
}

function pushTo(userId, event, data) {
  const set = streams.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) res.write(payload);
}

module.exports = { subscribe, pushTo };

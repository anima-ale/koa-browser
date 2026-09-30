// Giphy search proxy
const { jsonResponse, connectLambda } = require('./_zchat');

exports.handler = async (event) => {
  connectLambda(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(200, {});
  if (event.httpMethod !== 'GET') return jsonResponse(405, { error: 'Metodo non permesso.' });

  const q = event.queryStringParameters?.q || '';
  const apiKey = process.env.GIPHY_API_KEY || 'sXpGFD0s8V43jF7HWQWcGzRCYv3CqJNS';

  try {
    const url = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=24&rating=g&lang=it`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=24&rating=g`;

    const res = await fetch(url);
    const data = await res.json();
    const gifs = (data.data || []).map(g => ({
      id: g.id,
      title: g.title,
      url: g.images?.fixed_height?.url || g.images?.original?.url,
      preview: g.images?.fixed_height_small?.url || g.images?.preview_gif?.url,
      width: g.images?.fixed_height?.width,
      height: g.images?.fixed_height?.height
    }));
    return jsonResponse(200, { gifs });
  } catch (e) {
    return jsonResponse(500, { error: 'Giphy non disponibile.' });
  }
};

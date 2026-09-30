const { cors } = require('./_zchat');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Metodo non permesso.' });

  const q = req.query.q || '';
  const apiKey = process.env.GIPHY_API_KEY || 'sXpGFD0s8V43jF7HWQWcGzRCYv3CqJNS';

  try {
    const url = q
      ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(q)}&limit=24&rating=g&lang=it`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=24&rating=g`;

    const giphyRes = await fetch(url);
    const data = await giphyRes.json();
    const gifs = (data.data || []).map(g => ({
      id: g.id,
      title: g.title,
      url: g.images?.fixed_height?.url || g.images?.original?.url,
      preview: g.images?.fixed_height_small?.url || g.images?.preview_gif?.url,
      width: g.images?.fixed_height?.width,
      height: g.images?.fixed_height?.height
    }));
    res.status(200).json({ gifs });
  } catch (e) {
    res.status(500).json({ error: 'Giphy non disponibile.' });
  }
};

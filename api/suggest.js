export default async function handler(req, res) {
  const { q } = req.query;
  const response = await fetch(
    `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  const data = await response.json();
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(data);
}

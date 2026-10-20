/**
 * 404 and error handlers. Errors never leak stack traces or internals to the
 * client; body-parser errors map to proper 4xx responses.
 */
export function notFound(_req, res) {
  res.status(404).json({ error: 'Not found' });
}

export function errorHandler(logger = console) {
  // Express recognises error handlers by their four-argument signature.
  return (err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });

    logger.error(`[error] ${err?.name ?? 'Error'}: ${err?.message ?? err}`);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  };
}

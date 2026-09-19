// Input validation. Every route validates params/query/body with a zod schema
// before the controller runs, so controllers can trust their inputs.
import { badRequest } from '../lib/errors.js';

const formatIssues = (issues) =>
  issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));

export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!result.success) {
    return next(badRequest('Validation failed', formatIssues(result.error.issues)));
  }
  // Replace with the parsed (and coerced) values.
  if (result.data.body !== undefined) req.body = result.data.body;
  if (result.data.query !== undefined) req.query = result.data.query;
  if (result.data.params !== undefined) req.params = result.data.params;
  next();
};

export default validate;

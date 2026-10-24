import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://127.0.0.1:4173';

export const options = {
  vus: 1,
  iterations: 5,
};

export default function () {
  const response = http.get(BASE_URL);

  check(response, {
    'status is 200': (r) => r.status === 200,
    'content type is HTML': (r) =>
      (r.headers['Content-Type'] || '').includes('text/html'),
  });
}

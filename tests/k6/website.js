import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: Number(__ENV.VUS || 1),
  duration: __ENV.DURATION || '20s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

const siteUrl = __ENV.SITE_URL;

export default function () {
  if (!siteUrl) {
    throw new Error('Set SITE_URL to the deployed website URL, including the restaurant query string if needed.');
  }

  const response = http.get(siteUrl, {
    headers: { Accept: 'text/html' },
    tags: { endpoint: 'website-homepage' },
    timeout: '10s',
  });

  check(response, {
    'website returns HTTP 200': (r) => r.status === 200,
    'website returns HTML': (r) =>
      (r.headers['Content-Type'] || '').includes('text/html'),
    'website response is not empty': (r) => r.body.length > 0,
  });

  sleep(1);
}

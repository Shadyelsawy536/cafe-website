import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const failures = new Rate('failed_checks');
const responseTime = new Trend('health_check_response_time', true);
const loadMode = __ENV.LOAD_TEST === 'true';

export const options = {
  stages: loadMode
    ? [
        { duration: '15s', target: 1 },
        { duration: '30s', target: 5 },
        { duration: '30s', target: 10 },
        { duration: '15s', target: 0 },
      ]
    : [{ duration: '20s', target: 1 }],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
    failed_checks: ['rate<0.01'],
  },
};

const baseUrl =
  __ENV.SUPABASE_URL || 'https://rsajmvnbezztzdkbglbp.supabase.co';
const healthUrl = `${baseUrl.replace(/\/$/, '')}/functions/v1/health-check';

export default function () {
  const response = http.get(healthUrl, {
    headers: { Accept: 'application/json' },
    tags: { endpoint: 'health-check' },
    timeout: '10s',
  });

  responseTime.add(response.timings.duration);
  const passed = check(response, {
    'health check returns HTTP 200': (r) => r.status === 200,
    'health check returns JSON': (r) =>
      (r.headers['Content-Type'] || '').includes('application/json'),
    'health check reports ok=true': (r) => {
      try {
        return r.json('ok') === true;
      } catch (_) {
        return false;
      }
    },
    'health check includes checkedAt timestamp': (r) => {
      try {
        return typeof r.json('checkedAt') === 'string';
      } catch (_) {
        return false;
      }
    },
  });

  failures.add(!passed);
  sleep(1);
}

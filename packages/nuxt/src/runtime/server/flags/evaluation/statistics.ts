const Z_95 = 1.959964;

export function wilsonInterval(successes: number, trials: number) {
  if (trials === 0) return { low: 0, high: 0 };

  const p = successes / trials;
  const z2 = Z_95 * Z_95;
  const centre = (p + z2 / (2 * trials)) / (1 + z2 / trials);
  const margin =
    (Z_95 * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials))) /
    (1 + z2 / trials);

  return { low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

function logGamma(x: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const base = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.000000000190015;

  for (const coefficient of coefficients) series += coefficient / ++y;

  return -base + Math.log((2.5066282746310005 * series) / x);
}

function lowerRegularizedGamma(a: number, x: number) {
  if (x <= 0) return 0;

  let term = 1 / a;
  let sum = term;

  for (let n = 1; n < 1000 && Math.abs(term) > Math.abs(sum) * 1e-15; n += 1) {
    term *= x / (a + n);
    sum += term;
  }

  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function upperRegularizedGamma(a: number, x: number) {
  let b = x + 1 - a;
  let c = 1 / Number.MIN_VALUE;
  let d = 1 / b;
  let h = d;

  for (let i = 1; i < 1000; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < Number.MIN_VALUE) d = Number.MIN_VALUE;
    c = b + an / c;
    if (Math.abs(c) < Number.MIN_VALUE) c = Number.MIN_VALUE;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }

  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function chiSquarePValue(statistic: number, degreesOfFreedom: number) {
  if (statistic <= 0 || degreesOfFreedom <= 0) return 1;

  const a = degreesOfFreedom / 2;
  const x = statistic / 2;

  return x < a + 1 ? 1 - lowerRegularizedGamma(a, x) : upperRegularizedGamma(a, x);
}

export function sampleRatioPValue(observed: number[], weights: number[]) {
  const total = observed.reduce((sum, count) => sum + count, 0);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);

  if (total === 0 || weightTotal === 0) return 1;

  const statistic = observed.reduce((sum, count, index) => {
    const expected = (total * (weights[index] ?? 0)) / weightTotal;

    return expected === 0 ? sum : sum + (count - expected) ** 2 / expected;
  }, 0);

  return chiSquarePValue(statistic, observed.length - 1);
}

import _ from "lodash";
import child_process from "child_process";

export function throttle<T>(_this: any, wait: number, fn: () => Promise<T>) {
  return _.bind(_.throttle(fn, wait), _this);
}

export async function keepTrying<T>(fn: () => Promise<T>): Promise<T> {
  do {
    try {
      return await fn();
    } catch (e) {
      console.error(e);
      await sleep(1);
    }
  } while (true);
}

export async function sleep(seconds: number) {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
}

export async function preventMacSleep(fn: () => void) {
  const caffeinate = child_process.exec("caffeinate -dimsu");
  process.on("exit", () => caffeinate.kill("SIGABRT"));
  try {
    await fn();
  } finally {
    caffeinate.kill("SIGABRT");
  }
}

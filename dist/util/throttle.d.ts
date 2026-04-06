/**
 * Simple throttle function. Limits calls to at most once per `delay` ms.
 * When called during the delay period, the most recent arguments are queued
 * and executed after the delay elapses (trailing call).
 */
declare function throttle<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void;
export default throttle;
//# sourceMappingURL=throttle.d.ts.map
/**
 * Simple throttle function. Limits calls to at most once per `delay` ms.
 * When called during the delay period, the most recent arguments are queued
 * and executed after the delay elapses (trailing call).
 */
function throttle(fn, delay) {
    let lastCall = 0;
    let timer = null;
    let lastArgs = null;
    return function throttled(...args) {
        const now = Date.now();
        const remaining = delay - (now - lastCall);
        if (remaining <= 0) {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            lastCall = now;
            fn(...args);
        }
        else {
            lastArgs = args;
            if (!timer) {
                timer = setTimeout(() => {
                    lastCall = Date.now();
                    timer = null;
                    if (lastArgs) {
                        fn(...lastArgs);
                        lastArgs = null;
                    }
                }, remaining);
            }
        }
    };
}
export default throttle;
//# sourceMappingURL=throttle.js.map
/**
 * Simple deep equality check for plain objects and primitives.
 * Replaces lodash isEqual for our use case (channel filter matching).
 */
function deepEqual(a, b) {
    if (a === b)
        return true;
    if (a == null || b == null)
        return false;
    if (typeof a !== typeof b)
        return false;
    if (typeof a !== 'object')
        return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length)
        return false;
    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(b, key))
            return false;
        if (!deepEqual(a[key], b[key]))
            return false;
    }
    return true;
}
export default deepEqual;
//# sourceMappingURL=deep_equal.js.map
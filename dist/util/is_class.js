const isClass = (f) => {
    return (typeof f === 'function' &&
        /^class\s/.test(Function.prototype.toString.call(f)));
};
export default isClass;
//# sourceMappingURL=is_class.js.map
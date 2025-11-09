const assert = require("node:assert");

class JavaFloat {
    constructor(value) {
        this.value = Math.fround(value.valueOf());
    }
    valueOf() {
        return this.value;
    }
    add(other) {
        assert(other instanceof JavaFloat, 'Operand must be a JavaFloat');
        return new JavaFloat(this.value + other.value);
    }
    subtract(other) {
        assert(other instanceof JavaFloat, 'Operand must be a JavaFloat');
        return new JavaFloat(this.value - other.value);
    }
    multiply(other) {
        assert(other instanceof JavaFloat, 'Operand must be a JavaFloat');
        return new JavaFloat(this.value * other.value);
    }
    divide(other) {
        assert(other instanceof JavaFloat, 'Operand must be a JavaFloat');
        return new JavaFloat(this.value / other.value);
    }
    abs() {
        return new JavaFloat(Math.abs(this.value));
    }
    round() {
        return new JavaFloat(Math.round(this.value));
    }
    clamp(min, max) {
        assert(min instanceof JavaFloat, 'Min operand must be a JavaFloat');
        assert(max instanceof JavaFloat, 'Max operand must be a JavaFloat');
        return new JavaFloat(Math.min(Math.max(this.value, min.value), max.value));
    }
}

class JavaDouble {
    constructor(value) {
        this.value = value.valueOf()
    }
    valueOf() {
        return this.value;
    }
    add(other) {
        assert(other instanceof JavaDouble, 'Operand must be a JavaDouble');
        return new JavaDouble(this.value + other.value);
    }
    subtract(other) {
        assert(other instanceof JavaDouble, 'Operand must be a JavaDouble');
        return new JavaDouble(this.value - other.value);
    }
    multiply(other) {
        assert(other instanceof JavaDouble, 'Operand must be a JavaDouble');
        return new JavaDouble(this.value * other.value);
    }
    divide(other) {
        assert(other instanceof JavaDouble, 'Operand must be a JavaDouble');
        return new JavaDouble(this.value / other.value);
    }
    abs() {
        return new JavaDouble(Math.abs(this.value));
    }
    clamp(min, max) {
        assert(min instanceof JavaDouble, 'Min operand must be a JavaDouble');
        assert(max instanceof JavaDouble, 'Max operand must be a JavaDouble');
        return new JavaDouble(Math.min(Math.max(this.value, min.value), max.value));
    }
    round() {
        return new JavaDouble(Math.round(this.value));
    }
}

class JavaInt {
    constructor(value) {
        this.value = value.valueOf() | 0;
    }
    valueOf() {
        return this.value;
    }
    add(other) {
        return new JavaInt(this.value + other.value);
    }
    subtract(other) {
        return new JavaInt(this.value - other.value);
    }
    multiply(other) {
        return new JavaInt(this.value * other.value);
    }
    divide(other) {
        return new JavaInt((this.value / other.value) | 0);
    }
    abs() {
        return new JavaInt(Math.abs(this.value));
    }
}

class JavaLong {
    constructor(value) {
        this.value = BigInt(value.valueOf());
    }
    valueOf() {
        return this.value;
    }
    add(other) {
        return new JavaLong(this.value + other.value);
    }
    subtract(other) {
        return new JavaLong(this.value - other.value);
    }
    multiply(other) {
        return new JavaLong(this.value * other.value);
    }
    divide(other) {
        return new JavaLong(this.value / other.value);
    }
    abs() {
        return new JavaLong(this.value < 0n ? -this.value : this.value);
    }
}

const SIN_TABLE = new Array(65536);

for (let i = 0; i < 65536; i++) {

    SIN_TABLE[i] = new JavaFloat(Math.sin(
        new JavaDouble(i)
            .multiply(new JavaDouble(Math.PI))
            .multiply(new JavaDouble(2.0))
            .divide(new JavaDouble(65536.0))
            .valueOf()
    ))
}

function sin32(x) {
    assert(x instanceof JavaFloat, 'Operand must be a JavaFloat');
    return SIN_TABLE[new JavaInt(x
        .multiply(new JavaFloat(10430.378)
        ).valueOf()).valueOf() & 65535];
}

function cos32(x) {
    assert(x instanceof JavaFloat, 'Operand must be a JavaFloat');
    return SIN_TABLE[(new JavaInt(
            x.multiply(new JavaFloat(10430.378))
                .add(new JavaFloat(16384.0))).valueOf()
    ) & 65535];
}

module.exports = {
    sin32,
    cos32,
    JavaFloat,
    JavaDouble,
    JavaInt,
    JavaLong
}

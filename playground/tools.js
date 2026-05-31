import { python, shutdown } from "../index.js";

const { greet, total, Counter, multiply, factorial } = await python("./playground/tools.py");

console.log(await greet("Mayowa"));
console.log(await total([10, 20, 30]));
console.log(await multiply(4,6));
console.log(await factorial(5));
const counter = await Counter(5);
console.log(await counter.add(3));

await counter.release();
shutdown();

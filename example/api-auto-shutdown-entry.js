import { python } from "../index.js";

const fixture = await python("./test/fixture.py");
console.log(await fixture.add(20, 22));

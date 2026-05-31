import { shutdown } from "../index.js";
import fixture from "python:./test/fixture.py";

console.log(await fixture.add(20, 22));
shutdown();

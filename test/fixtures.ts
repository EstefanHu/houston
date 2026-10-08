import houston1Json from '../js/data/rockets/houston-1.json';
import { parseRocket } from '../js/data/parts';

/** Houston-1, the default rocket, which most unit tests use. */
export const rocket = parseRocket(houston1Json);

import rocketJson from './rocket.json';
import { parseRocket } from './parts';

/** The validated rocket. Importing this throws early if rocket.json is malformed. */
export const rocket = parseRocket(rocketJson);

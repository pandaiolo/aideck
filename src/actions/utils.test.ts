import { describe, expect, it } from "vitest";
import { getCoords } from "./utils";

describe("getCoords", () => {
	it("returns coordinates when present", () => {
		expect(getCoords({ coordinates: { column: 2, row: 1 } })).toEqual({
			column: 2,
			row: 1,
		});
	});

	it("returns undefined when coordinates missing", () => {
		expect(getCoords({})).toBeUndefined();
	});

	it("returns undefined when coordinates is undefined", () => {
		expect(getCoords({ coordinates: undefined })).toBeUndefined();
	});

	it("returns null when coordinates is null", () => {
		expect(getCoords({ coordinates: null })).toBeNull();
	});

	it("returns coordinates at origin", () => {
		expect(getCoords({ coordinates: { column: 0, row: 0 } })).toEqual({
			column: 0,
			row: 0,
		});
	});
});

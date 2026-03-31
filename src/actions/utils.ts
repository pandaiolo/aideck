export interface ActionLike {
	id: string;
	setImage(image: string): Promise<void>;
}

export function getCoords(
	payload: Record<string, unknown>,
): { column: number; row: number } | undefined {
	return payload.coordinates as { column: number; row: number } | undefined;
}

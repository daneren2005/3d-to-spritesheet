const ANGLES_COUNT = 16;

export default function generateAngles(distance) {
	let halfDistance = distance / 2;

	let angles = {};
	for(let i = 0; i < ANGLES_COUNT; i++) {
		let angle = (360 / ANGLES_COUNT) * i;
		// Can just mirror left/right to save space
		if(angle > 90 && angle < 270) {
			continue;
		}

		let radians = angle * Math.PI / 180;
		angles[angle] = [-Math.cos(radians) * halfDistance, distance, Math.sin(radians) * halfDistance];
	}

	return angles;
}
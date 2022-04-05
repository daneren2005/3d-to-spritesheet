const ANGLES_COUNT = 16;

export default function generateAngles(distance, config) {
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

	let iconParams = {
		/*position: [0, halfDistance, halfDistance],
		target: [-0.03, 0.26, 0]*/

		position: [0, halfDistance, halfDistance / 3],
		target: [0, 0.5, 0]
	};
	if(config && config.icon && config.icon.camera) {
		iconParams = config.icon.camera;
	}

	return {
		spritesheet: angles,
		icon: iconParams
	};
}
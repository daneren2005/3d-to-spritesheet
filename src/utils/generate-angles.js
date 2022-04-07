export default function generateAngles(modelDimensions, config, recordParams) {
	let distanceMultiplier = recordParams.distance || 1;
	let distance = Math.max(modelDimensions.x, modelDimensions.y, modelDimensions.z) * distanceMultiplier;

	let baseAngle = angleToRadians(90);
	let viewAngle = angleToRadians(recordParams.viewAngle);

	let iconParams = {
		position: getSphereAngle(distance * 0.25, {
			x: modelDimensions.x,
			y: modelDimensions.y * 1.6,
			z: modelDimensions.z
		}, baseAngle, 0),
		target: [0, (modelDimensions.y / 2) * 1.6, 0],
		startAngle: 270
	};
	if(config && config.icon && config.icon.camera) {
		iconParams = {
			...iconParams,
			...config.icon.camera
		};
	}

	return {
		spritesheet: {
			position: getSphereAngle(distance, modelDimensions, baseAngle, viewAngle),
			target: [0, modelDimensions.y / 2, 0]
		},
		icon: iconParams
	};
}

export function angleToRadians(angle) {
	if(typeof(angle) === 'string') {
		angle = parseFloat(angle);
	}
	if(isNaN(angle)) {
		angle = 90;
	}

	return angle * Math.PI / 180;
}

function getSphereAngle(distance, modelDimensions, baseAngle, viewAngle) {
	let x = -distance * Math.cos(baseAngle) * Math.sin(viewAngle);
	let y = (modelDimensions.y / 2) + distance * Math.sin(viewAngle);
	let z = distance * Math.sin(baseAngle) * Math.cos(viewAngle);

	return [x, y, z];
}
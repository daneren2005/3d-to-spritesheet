export default function generateAngles(modelDimensions, config, recordParams) {
	let baseDistance = Math.max(modelDimensions.x, modelDimensions.y, modelDimensions.z);
	let distance = baseDistance * (recordParams.distance || 1);
	let shadowDistance = baseDistance * (recordParams.shadowDistance || 1);

	let baseAngle = angleToRadians(90);
	let viewAngle = angleToRadians(recordParams.viewAngle);
	let shadowSideAngle = angleToRadians(180 - recordParams.shadowSideAngle);
	let shadowHeightAngle = angleToRadians(180 - recordParams.shadowHeightAngle);

	let iconParams = {
		position: getSphereAngle(distance * 0.25, {
			x: modelDimensions.x,
			y: modelDimensions.y * 1.6,
			z: modelDimensions.z
		}, baseAngle, 0),
		target: [0, (modelDimensions.y / 2) * 1.6, 0],
		light: getSphereAngle(shadowDistance, modelDimensions, shadowSideAngle, shadowHeightAngle),
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
			target: [0, modelDimensions.y / 2, 0],
			light: getSphereAngle(shadowDistance, modelDimensions, shadowSideAngle, shadowHeightAngle)
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
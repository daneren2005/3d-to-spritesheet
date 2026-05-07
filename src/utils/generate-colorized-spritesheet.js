const MIN_BLUE_HUE = 200;
const MAX_BLUE_HUE = 260;
const MIN_RED_HUE1 = 0;
const MAX_RED_HUE1 = 20;
const MIN_RED_HUE2 = 340;
const MAX_RED_HUE2 = 360;

export default function generateColorizedSpritesheet(canvas, context, defaultPallete) {
	let imageData = context.getImageData(0, 0, canvas.width, canvas.height);
	let pixelBuffer = imageData.data.buffer;
	let pixelArray = new Uint8ClampedArray(pixelBuffer);

	const pallete = [
		{
			r: 0,
			g: 4,
			b: 76
		},
		{
			r: 0,
			g: 20,
			b: 108
		},
		{
			r: 0,
			g: 36,
			b: 148
		},
		{
			r: 0,
			g: 60,
			b: 192
		}
	];
	const PALLET_INDEX = pallete.length - 1;

	// Iterate through every pixel in the image.
	for(let p = 0; p < pixelArray.length / 4; p++) {
		let index = 4 * p;

		let r = pixelArray[index];
		let g = pixelArray[++index];
		let b = pixelArray[++index];
		let alpha = pixelArray[++index];

		// If this is a transparent pixel, ignore, move on.
		if(alpha === 0) {
			continue;
		}

		// We are generating spritesheets from 3d models with real lighting - so not going to have consistent colors to pick from
		// Looking at https://stackoverflow.com/a/33240304 we can see that hue in hsv space gives a good indication of what "blue" is for us to latch onto
		if(defaultPallete === 'blue-hue') {
			let v = Math.max(r, g, b);
			let c = v - Math.min(r, g, b);
			let h = c && ((v==r) ? (g-b)/c : ((v==g) ? 2+(b-r)/c : 4+(r-g)/c));
			let hue = 60 * (h < 0 ? h + 6 : h);

			if(hue > MIN_BLUE_HUE && hue < MAX_BLUE_HUE) {
				/*let f = (1 - Math.abs(v + v - c - 1));
				let saturation = f ? Math.abs(c / f) : 0;
				let lightness = (v + v - c) / 2;
				// let colorIndex = Math.round(saturation * PALLET_INDEX);
				let colorIndex = Math.round(Math.max(0, (Math.abs(v) / 255 * 100) - 20) / 80 * PALLET_INDEX);
				console.log('colorIndex: ', colorIndex);*/

				let colorIndex = PALLET_INDEX - Math.round((hue - MIN_BLUE_HUE) / (MAX_BLUE_HUE - MIN_BLUE_HUE) * PALLET_INDEX);
				let newColor = pallete[colorIndex];
				pixelArray[index - 1] = newColor.b;
				pixelArray[index - 2] = newColor.g;
				pixelArray[index - 3] = newColor.r;
			}
		}
		else if(defaultPallete === 'red-hue') {
			if(r === 0 && g === 0 && b === 0) {
				continue;
			}

			let v = Math.max(r, g, b);
			let c = v - Math.min(r, g, b);
			let h = c && ((v==r) ? (g-b)/c : ((v==g) ? 2+(b-r)/c : 4+(r-g)/c));
			let hue = 60 * (h < 0 ? h + 6 : h);

			if(hue >= MIN_RED_HUE1 && hue < MAX_RED_HUE1) {
				let colorIndex = PALLET_INDEX - Math.round((hue - -20) / (MAX_RED_HUE1 - -20) * PALLET_INDEX);
				let newColor = pallete[colorIndex];
				pixelArray[index - 1] = newColor.b;
				pixelArray[index - 2] = newColor.g;
				pixelArray[index - 3] = newColor.r;
			} else if(hue > MIN_RED_HUE2 && hue <= MAX_RED_HUE2) {
				let colorIndex = PALLET_INDEX - Math.round((hue - MIN_RED_HUE2) / (380 - MIN_RED_HUE2) * PALLET_INDEX);
				let newColor = pallete[colorIndex];
				pixelArray[index - 1] = newColor.b;
				pixelArray[index - 2] = newColor.g;
				pixelArray[index - 3] = newColor.r;
			}
		}
	}

	let newImageData = new ImageData(pixelArray, canvas.width, canvas.height);
	context.reset();
	context.putImageData(newImageData, 0, 0);
}

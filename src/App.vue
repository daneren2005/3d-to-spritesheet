<template>
	<div id="app" @drop.prevent="droppedFiles" @dragover.prevent>
		
	</div>
</template>

<script>
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { LoadingManager } from 'three/src/loaders/LoadingManager';
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader';
import Stats from 'three/examples/jsm/libs/stats.module';
import { GUI } from 'three/examples/jsm/libs/dat.gui.module';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import axios from 'axios';
import defaultConfig from '../public/models/ToonRTS_demo_Knight/config.json';
import loadDroppedFiles from '@/utils/load-dropped-files';
import generateAngles from '@/utils/generate-angles';
import pngquant from '@/utils/pngquant';

const DEFAULT_DISTANCE = 1.05;
const DEFAULT_FRAME_SIZE = 256;
export default {
	data: () => {
		return {
			config: null,
			currentModel: null,
			directionalLight: null,
			modelReady: false,
			renderer: null,
			camera: null,
			gui: null,
			scene: null,
			mixer: null,
			activeAction: null,
			animationActions: {},
			animationsFolder: null,
			modelFolder: null,
			actionsFolder: null,
			recordParams: {
				frames: 4,
				frameSize: DEFAULT_FRAME_SIZE,
				sheetSize: 4096,
				distance: DEFAULT_DISTANCE,
				compressPNG: true
			},
			angles: generateAngles(DEFAULT_DISTANCE),
			isRecording: false
		};
	},
	methods: {
		setAction(toAction) {
			if(toAction != this.activeAction) {
				let lastAction = this.activeAction;
				this.activeAction = toAction;
				if(lastAction) {
					lastAction.stop();
				}
				// For taking screenshots we want an instant transition to start recording
				/*lastAction.fadeOut(1);
				this.activeAction.reset();
				this.activeAction.fadeIn(1);*/
				this.activeAction.play();
			} else {
				toAction.reset();
			}
		},

		async recordAllAsSheets(name) {
			let angleNames = Object.keys(this.angles.spritesheet);
			angleNames.sort((a, b) => {
				return parseInt(a) - parseInt(b);
			});
			let animationNames = Object.keys(this.animationActions);
			const maxSize = this.recordParams.sheetSize / this.recordParams.frameSize;

			let options = this.initRecordings(name);
			for(let j = 0; j < animationNames.length; j++) {
				let animationName = animationNames[j];
				let { frames } = this.animationActions[animationName];

				let rowsLeft = (maxSize - 1) - options.row;
				let cellsLeft = rowsLeft * maxSize + (maxSize - 1 - options.column); 
				let neededSlots = frames * angleNames.length;
				if(neededSlots > cellsLeft) {
					console.warn(`skipping to next sheet since we need ${neededSlots} slots with ${cellsLeft} left`);
					await this.startNewSheet(options);
				}

				await this.drawFramesFromAnimation(animationName, options);
			}
			await this.finishRecordings(options);

			if(this.config.icon) {
				this.setRenderSize(this.config.icon.size);
				this.resetSheetCanvas(options);
				options.canvas.width = this.config.icon.size;
				options.canvas.height = this.config.icon.size;
				await this.drawFramesFromAnimation('icon', options);
				await this.saveImageToZip(options, 'icon.png');
			}

			options.zip.generateAsync({
				type: 'blob',
				streamFiles: true
			}).then((content) => {
				saveAs(content, `${name}.zip`);
			});
		},
		async recordAnimationAsSheet(name) {
			let options = this.initRecordings(name);
			await this.drawFramesFromAnimation(name, options);
			await this.finishRecordings(options);

			options.zip.generateAsync({
				type: 'blob'
			}).then((content) => {
				saveAs(content, `${name}.zip`);
			});
		},

		

		initRecordings(modelName) {
			let canvas = document.createElement('canvas');
			if(modelName === 'icon') {
				canvas.width = this.config.icon.size;
				canvas.height = this.config.icon.size;
				this.setRenderSize(this.config.icon.size);
			} else {
				canvas.width = this.recordParams.sheetSize;
				canvas.height = this.recordParams.sheetSize;

				let size = this.config.frameSize || DEFAULT_FRAME_SIZE;
				this.setRenderSize(size);
			}
			let ctx = canvas.getContext('2d');

			return {
				zip: new JSZip(),
				canvas,
				ctx,
				row: 0,
				column: 0,
				sheet: 0,
				json: {},
				modelName
			};
		},
		async finishRecordings(options) {
			if(options.column > 0 || options.row > 0) {
				// If we are printing a single sheet, don't add _index to the names
				let sheetName = `${options.modelName}${options.sheet}.png`;
				if(options.sheet === 0) {
					sheetName = `${options.modelName}.png`;

					Object.values(options.json).forEach(animationJSON => {
						animationJSON.sheet = animationJSON.sheet.replace('0.png', '.png');
					});
				}

				await this.saveImageToZip(options, sheetName);
			}

			options.zip.file('animations.json', JSON.stringify(options.json, null, '\t'));
		},

		async drawFramesFromAnimation(name, options) {
			if(name === 'icon') {
				this.updateAngle('icon');

				let animationName = this.config.icon.animation;
				let { action, frames, animationConfig } = this.animationActions[animationName];
				await this.drawFramesFromAnimationAngle(options, action, frames, name, 'icon', animationConfig);
			} else {
				let angleNames = Object.keys(this.angles.spritesheet);
				angleNames.sort((a, b) => {
					return parseInt(a) - parseInt(b);
				});

				let { action, frames, animationConfig } = this.animationActions[name];
				for(let i = 0; i < angleNames.length; i++) {
					let angleName = angleNames[i];
					this.updateAngle(angleName);

					await this.drawFramesFromAnimationAngle(options, action, frames, name, angleName, animationConfig);
				}
			}
		},
		async drawFramesFromAnimationAngle(options, action, frames, animationName, angle, animationConfig) {
			this.setAction(action);

			let duration = this.getActionDuration(action, animationConfig);
			const FRAMES = frames || this.recordParams.frames;
			let skipTime = duration / FRAMES;
			if(FRAMES <= 1) {
				skipTime = 0;
			}

			this.isRecording = true;
			// 0 update seems to fix some models starting out different than it should - peasant starts out holding gold and wood even though a 0ms update shows him starting to swing a pickaxe
			this.mixer.update(0);
			await raf();
			for(let i = 0; i < FRAMES; i++) {
				await this.drawFrameFromAnimation(options, animationName, angle);

				this.mixer.update(skipTime);
				await raf();
			}
			this.isRecording = false;
		},
		getActionDuration(action, animationConfig) {
			let durationMultiplier = 1;
			if(animationConfig && animationConfig.skipEnd) {
				durationMultiplier = 1 - animationConfig.skipEnd;
			}

			return action._clip.duration * durationMultiplier;
		},

		async drawFrameFromAnimation(options, animationName, angle) {
			options.ctx.drawImage(this.renderer.domElement, options.column * this.recordParams.frameSize, options.row * this.recordParams.frameSize);
			
			const maxSize = this.recordParams.sheetSize / this.recordParams.frameSize;
			if(!options.json[animationName]) {
				options.json[animationName] = {
					sheet: `${options.modelName}${options.sheet}.png`,
					directions: {}
				};
			}
			if(!options.json[animationName].directions[angle]) {
				options.json[animationName].directions[angle] = [];
			}
			options.json[animationName].directions[angle].push(options.row * maxSize + options.column);
			// Still record the flipped side
			if(angle != 90 && angle != 270) {
				let altAngle = null;
				if(angle < 90) {
					altAngle = 180 - angle;
				} else {
					altAngle = (360 - angle) + 180;
				}

				if(!options.json[animationName].directions[altAngle]) {
					options.json[animationName].directions[altAngle] = [];
				}
				options.json[animationName].directions[altAngle].push(options.row * maxSize + options.column);
			}

			options.column++;
			if(options.column >= maxSize) {
				options.column = 0;
				options.row++;

				if(options.row >= maxSize) {
					await this.startNewSheet(options);
				}
			}
		},
		async saveImageToZip(options, sheetName) {
			let imgDataUrl = options.canvas.toDataURL('image/png').replace('data:image/png;base64,', '');
			let outputData = imgDataUrl;

			// TODO: This needs some sort of loading indicator - for now we just pause animation to make it a little more obvious something is happening
			if(this.recordParams.compressPNG) {
				this.isRecording = true;
				let binaryString = window.atob(imgDataUrl);
				let inputByteArray = new Uint8Array(binaryString.length);
				for(let i = 0; i < binaryString.length; i++) {
					inputByteArray[i] = binaryString.charCodeAt(i);
				}

				try {
					let outputByteArray = await pngquant(inputByteArray, {
						quality: '10-100',
						speed: '4'
					});

					outputData = outputByteArray;
				} catch(e) {
					alert(`Failed to run pngquant on image ${sheetName}`);
					throw e;
				} finally {
					this.isRecording = false;
				}
			}

			options.zip.file(sheetName, outputData, { base64: true });
		},
		async startNewSheet(options) {
			await this.saveImageToZip(options, `${options.modelName}${options.sheet}.png`);
			this.resetSheetCanvas(options);
			options.sheet++;
		},
		resetSheetCanvas(options) {
			options.row = 0;
			options.column = 0;
			let canvas = document.createElement('canvas');
			canvas.width = this.recordParams.sheetSize;
			canvas.height = this.recordParams.sheetSize;
			options.canvas = canvas;
			options.ctx = canvas.getContext('2d');
		},
		getPNGDataUrl() {
			return this.renderer.domElement.toDataURL('image/png');
		},

		onWindowResize() {
			let size = Math.min(window.innerWidth, window.innerHeight);
			let scale = size / this.recordParams.frameSize;

			this.renderer.domElement.style.transform = `scale(${scale})`;
		},

		addAnimation(name, action, frames, animationConfig) {
			this.animationActions[name] = {
				frames,
				action,
				animationConfig
			};
		},
		updateAngle(angleName) {
			let angles = this.angles.spritesheet[angleName] || this.angles[angleName];
			if(angles.position) {
				this.camera.position.set(...angles.position);
				this.controls.target.set(...angles.target);
			} else {
				this.camera.position.set(...angles);
			}

			this.directionalLight.position.copy(this.camera.position);

			if(this.config) {
				let angleConfig = this.config.animations[angleName] || this.config[angleName];
				if(angleConfig && angleConfig.size) {
					this.setRenderSize(angleConfig.size);
				} else {
					let size = this.config.frameSize || DEFAULT_FRAME_SIZE;
					this.setRenderSize(size);
				}
			}
		},
		setRenderSize(size) {
			if(this.lastRenderSize == size) {
				return;
			}

			this.recordParams.frameSize = size;
			this.renderer.setSize(size, size);
			this.onWindowResize();

			this.lastRenderSize = size;
		},

		loadModelFromConfig(config, files = null) {
			this.config = config;
			if(config.distance) {
				this.recordParams.distance = config.distance;
			} else {
				this.recordParams.distance = DEFAULT_DISTANCE;
			}
			this.angles = generateAngles(this.recordParams.distance);
			if(config.sheetSize) {
				this.recordParams.sheetSize = config.sheetSize;
			}
			if(config.frameSize) {
				this.setRenderSize(config.frameSize);
			}

			let filenames = [config.model, config.texture, ...Object.values(config.animations).map(animation => animation.name)];
			if(files) {
				let usedFiles = files.filter(file => {
					return filenames.includes(file.name);
				});
				let missingAnimations = Object.keys(config.animations).filter(animationKey => {
					return !usedFiles.map(file => file.name).includes(config.animations[animationKey].name);
				});
				missingAnimations.forEach(missingAnimation => {
					alert(`Missing animation files for ${missingAnimation}`);
				});

				this.loadModelFromFiles(usedFiles.map(file => {
					let animationName = null;
					Object.keys(config.animations).forEach(animationKey => {
						let filename = config.animations[animationKey].name;
						if(file.name === filename) {
							animationName = animationKey;
						}
					});

					return {
						blob: file,
						name: file.name.toLowerCase(),
						animationName
					};
				}));
			} else {
				this.loadModelFromUrls(filenames);
			}
		},
		async loadModelFromUrls(urls) {
			let blobs = [];
			for(let i = 0; i < urls.length; i++) {
				const url = urls[i];
				let response = await axios.get(url, {
					responseType: 'blob'
				});

				blobs.push({
					name: url.split('/').at(-1).toLowerCase(),
					blob: response.data
				});
			}

			this.loadModelFromFiles(blobs);
		},
		async loadModelFromFiles(blobs) {
			if(this.currentModel) {
				this.scene.remove(this.currentModel);
				this.currentModel = null;
			}
			this.updateAngle('90');
			this.animationActions = {};

			this.modelReady = false;
			const manager = new LoadingManager();
			manager.addHandler( /\.tga$/i, new TGALoader(manager) );
			const fbxLoader = new FBXLoader(manager);

			let modelBlobSet = blobs.find(({name}) => name.toLowerCase().includes('.fbx') && !name.includes('@'));
			let modelBlob = modelBlobSet.blob;
			let modelName = modelBlobSet.name;
			modelBlob = await this.fixModelData(modelBlob);
			let textureBlob = blobs.find(({name}) => name.includes('.tga')).blob;
			manager.setURLModifier((url) => {
				let matchingBlob = blobs.find(({name}) => name.includes(url));

				if(modelName.includes(url)) {
					return URL.createObjectURL(modelBlob);
				} else if(matchingBlob) {
					return URL.createObjectURL(matchingBlob.blob);
				} else if(url.includes('.tga') && textureBlob) {
					return URL.createObjectURL(textureBlob);
				} else {
					return url;
				}
			});

			const animations = {};
			const recordAnimations = {};

			let model = this.currentModel = await fbxLoadPromise(fbxLoader, modelName);
			model.scale.set(0.01, 0.01, 0.01);
			this.mixer = new THREE.AnimationMixer(model);

			this.scene.add(model);
			if(this.modelFolder) {
				while(this.modelFolder.__controllers.length) {
					this.modelFolder.remove(this.modelFolder.__controllers[0]);
				}
			} else {
				this.modelFolder = this.gui.addFolder('Model');
			}
			this.modelFolder.add(model.position, 'x', -4, 4).step(0.1).listen();
			this.modelFolder.add(model.position, 'y', -4, 4).step(0.1).listen();
			this.modelFolder.add(model.position, 'z', -4, 4).step(0.1).listen();
			this.modelFolder.add(this.recordParams, 'distance', 0.5, 5).step(0.05).name('Distance').listen().onChange((newValue) => {
				this.angles = generateAngles(newValue);
				this.updateAngle('90');
			});

			while(this.animationsFolder.__controllers.length) {
				this.animationsFolder.remove(this.animationsFolder.__controllers[0]);
			}
			while(this.actionsFolder.__controllers.length >= 2) {
				this.actionsFolder.remove(this.actionsFolder.__controllers.at(-1));
			}

			let animationBlobs = blobs.filter((blob) => {
				return blob.name.includes('@') && blob.name.toLowerCase().includes('.fbx')
					||
					blob.animationName;
			});
			for(let i = 0; i < animationBlobs.length; i++) {
				let { name, animationName } = animationBlobs[i];
				if(!animationName) {
					animationName = name.substring(name.indexOf('@') + 1, name.toLowerCase().lastIndexOf('.fbx'));
				}
				let animationObject = await fbxLoadPromise(fbxLoader, name);
				let animationAction = this.mixer.clipAction(animationObject.animations[0]);

				// Add actions to folders
				animations[animationName] = () => {
					this.setAction(animationAction);
				};
				this.animationsFolder.add(animations, animationName);

				recordAnimations[animationName] = () => {
					this.recordAnimationAsSheet(animationName);
				};
				this.actionsFolder.add(recordAnimations, animationName);

				let frames = this.recordParams.frames;
				let animationConfig = null;
				if(this.config.animations[animationName]) {
					if(this.config.animations[animationName].frames) {
						frames = this.config.animations[animationName].frames;
					}
					animationConfig = this.config.animations[animationName];
				}

				this.addAnimation(animationName, animationAction, frames, animationConfig);
			}

			if(this.config.icon) {
				recordAnimations.icon = () => {
					this.recordAnimationAsSheet('icon');
				};
				this.actionsFolder.add(recordAnimations, 'icon');
			}

			this.modelReady = true;
			if(this.animationActions.idle) {
				this.setAction(this.animationActions.idle.action);
			} else if(Object.values(this.animationActions).length > 0) {
				this.setAction(Object.values(this.animationActions)[0].action);
			}
		},
		async fixModelData(startBlob) {
			let arrayBuffer = await startBlob.arrayBuffer();
			let modelArray = new Uint8Array(arrayBuffer);

			let matchCount = 0;
			const psdSearchCodes = ['.', 'p', 's', 'd'].map(char => char.charCodeAt(0));
			const tgaReplaceCodes = ['.', 't', 'g', 'a'].map(char => char.charCodeAt(0));
			for(let i = 0; i < modelArray.length; i++) {
				let matches = true;
				for(let j = 0; j < psdSearchCodes.length; j++) {
					if(modelArray[i + j] !== psdSearchCodes[j]) {
						matches = false;
						break;
					}
				}

				if(matches) {
					matchCount++;

					for(let j = 0; j < psdSearchCodes.length; j++) {
						modelArray[i + j] = tgaReplaceCodes[j];
					}
				}
			}
			if(matchCount > 0) {
				console.warn(`Fixed: replaced .psd with .tga ${matchCount} times`);
			}

			return new Blob([arrayBuffer]);
		},
		async droppedFiles(event) {
			let files = await loadDroppedFiles(event);
			let modelFile = files.find(file => file.name.toLowerCase().includes('.fbx') && !file.name.includes('@'));
			let textureFile = files.find(file => file.name.toLowerCase().includes('.tga'));
			if(!modelFile || !textureFile) {
				alert('You need to upload at least a fbx and a texture file');
				return;
			}

			let configFile = files.find(file => file.name.toLowerCase() === 'config.json');
			if(configFile) {
				let reader = new FileReader();
				reader.onload = (event) => {
					let config = JSON.parse(event.target.result);
					this.loadModelFromConfig(config, files);
				};
				reader.readAsText(configFile);
			} else {
				this.loadModelFromFiles(files.map(file => {
					return {
						blob: file,
						name: file.name.toLowerCase()
					};
				}));
			}
		}
	},
	mounted() {
		const scene = this.scene = new THREE.Scene();
		// scene.add(new THREE.AxesHelper(5))

		const light1  = new THREE.AmbientLight(0xFFFFFF, 0.3);
		light1.name = 'ambient_light';
		scene.add(light1);

		const light2  = new THREE.DirectionalLight(0xFFFFFF, 0.8 * Math.PI);
		light2.name = 'main_light';
		scene.add(light2);
		this.directionalLight = light2;

		const hemiLight = new THREE.HemisphereLight();
		hemiLight.name = 'hemi_light';
		scene.add(hemiLight);

		const camera = this.camera = new THREE.PerspectiveCamera(
			75,
			1,
			0.01,
			1000
		);
		this.updateAngle('90');
		// camera.rotation.set won't work due - need to use controls.target.set when using OrbitControls for mouse handlers

		const renderer = this.renderer = new THREE.WebGLRenderer({
			// So we can save canvas to a PNG
			preserveDrawingBuffer: true,
			alpha: true
		});

		renderer.setSize(this.recordParams.frameSize, this.recordParams.frameSize);
		renderer.gammaOutput = true;

		this.$el.appendChild(renderer.domElement);

		// Gives mouse movement/rotation/zoom handlers
		const controls = this.controls = new OrbitControls(camera, renderer.domElement);
		controls.enableDamping = true;
		// controls.autoRotate = true;
		controls.target.set(0, 0, 0);

		this.loadModelFromConfig(defaultConfig);

		window.addEventListener('resize', this.onWindowResize, false);
		this.onWindowResize();

		const stats = Stats();
		// this.$el.appendChild(stats.dom);

		const gui = this.gui = new GUI();
		this.animationsFolder = gui.addFolder('Animations');
		// animationsFolder.open();

		const cameraFolder = gui.addFolder('Camera');
		cameraFolder.add(camera.position, 'x', -4, 4).name('Position x').step(0.01).listen();
		cameraFolder.add(camera.position, 'y', -4, 4).name('Position y').step(0.01).listen();
		cameraFolder.add(camera.position, 'z', -4, 4).name('Position z').step(0.01).listen();
		cameraFolder.add(camera, 'fov', -100,100).step(1).listen();
		cameraFolder.add(camera, 'near', -100,100).step(1).listen();
		cameraFolder.add(camera, 'far', -100,100).step(1).listen();
		cameraFolder.add(camera, 'aspect', -100,100).step(1).listen();
		cameraFolder.add(camera, 'zoom', -100,100).step(0.1).listen();
		cameraFolder.add(camera.rotation, 'x', -4, 4).name('Rotation x').step(0.01).listen();
		cameraFolder.add(camera.rotation, 'y', -4, 4).name('Rotation y').step(0.01).listen();
		cameraFolder.add(camera.rotation, 'z', -4, 4).name('Rotation z').step(0.01).listen();
		cameraFolder.add(controls.target, 'x', -4, 4).name('Target x').step(0.01).listen();
		cameraFolder.add(controls.target, 'y', -4, 4).name('Target y').step(0.01).listen();
		cameraFolder.add(controls.target, 'z', -4, 4).name('Target z').step(0.01).listen();
		// cameraFolder.open();

		const anglesFolder = gui.addFolder('Angles');
		let angleUpdater = {};

		let angleNames = Object.keys(this.angles.spritesheet);
		angleNames.sort((a, b) => {
			return parseInt(a) - parseInt(b);
		});
		angleNames.forEach((angleName) => {
			angleUpdater[angleName] = () => {
				this.updateAngle(angleName);
			};
			anglesFolder.add(angleUpdater, angleName);
		});
		angleUpdater.icon = () => {
			this.updateAngle('icon');
		};
		anglesFolder.add(angleUpdater, 'icon');

		this.actionsFolder = gui.addFolder('Actions');
		this.actionsFolder.add({
			'Save As Sheets': () => {
				this.recordAllAsSheets(this.config.name);
			}
		}, 'Save As Sheets');
		this.actionsFolder.open();

		this.frameSettingsFolder = this.gui.addFolder('Frames');
		this.frameSettingsFolder.add(this.recordParams, 'frames', 1, 20).step(1).name('Frames').listen();
		this.frameSettingsFolder.add(this.recordParams, 'frameSize', 32, 1024).step(32).name('Frame Size').listen().onChange((newValue) => {
			renderer.setSize(newValue, newValue);
			this.onWindowResize();
		});
		this.frameSettingsFolder.add(this.recordParams, 'sheetSize', 64, 16384).step(64).name('Sheet Size').listen();
		this.frameSettingsFolder.add(this.recordParams, 'compressPNG').name('Compress PNG').listen();

		const lightsFolder = gui.addFolder('Lights');
		lightsFolder.add(light1, 'intensity', 0, 5).name('Ambient Light').step(0.01).listen();
		lightsFolder.add(light2, 'intensity', 0, 5).name('Directional Light').step(0.01).listen();
		lightsFolder.add(hemiLight, 'intensity', 0, 5).name('Hemisphere Light').step(0.01).listen();

		const clock = new THREE.Clock();

		const animate = () => {
			requestAnimationFrame(animate);

			controls.update();

			if(this.modelReady && !this.isRecording) this.mixer.update(clock.getDelta());

			render();

			stats.update();
		};

		function render() {
			renderer.render(scene, camera);
		}

		animate();
	},
	destroyed() {
		this.gui.destroy();
	}
};

function raf() {
	return new Promise((resolve) => {
		requestAnimationFrame(() => {
			resolve();
		});
	});
}

function fbxLoadPromise(fbxLoader, url) {
	return new Promise((resolve, reject) => {
		fbxLoader.load(url, (object) => {
			resolve(object);
		}, (xhr) => {

		}, (error) => {
			console.error(error);
			reject(error);
		});
	});
}
</script>

<style>
html, body, #app {
	margin: 0;
	padding: 0;
	width: 100%;
	height: 100%;
	overflow: hidden;
}

body {
	background: black;
}
#app > canvas {
	background: white;

	transform-origin: top left;
}
</style>

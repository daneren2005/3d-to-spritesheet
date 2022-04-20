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
import generateAngles, { angleToRadians } from '@/utils/generate-angles';
import pngquant from '@/utils/pngquant';

const DEFAULT_FRAME_SIZE = 256;
const DEFAULT_ANGLES_COUNT = 16;
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
				distance: 1,
				viewAngle: 0,
				compressPNG: true,
				shadows: true,
				shadowHeightAngle: 0,
				shadowSideAngle: 0,
				shadowDistance: 0,
				shadowOpacity: 0,
				packTextures: true
			},
			angles: null,
			angleNames: null,
			anglesFolder: null,
			isRecording: false,
			directoryHandle: null
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
			let angleNames = this.angleNames;
			let animationNames = Object.keys(this.animationActions);
			const maxSize = this.recordParams.sheetSize / this.recordParams.frameSize;

			let options = this.initRecordings(name);
			for(let j = 0; j < animationNames.length; j++) {
				let animationName = animationNames[j];
				let { frames } = this.animationActions[animationName];

				// TODO: Implement at least a best guess with packing textures as well
				if(!this.recordParams.packTextures) {
					let rowsLeft = (maxSize - 1) - options.row;
					let cellsLeft = rowsLeft * maxSize + (maxSize - options.column); 
					let neededSlots = frames * angleNames.length;
					if(neededSlots > cellsLeft) {
						console.warn(`skipping to next sheet since we need ${neededSlots} slots with ${cellsLeft} left`);
						await this.startNewSheet(options);
					}
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

			options.finishWriting();
		},
		async recordAnimationAsSheet(name) {
			let options = this.initRecordings(name);
			await this.drawFramesFromAnimation(name, options);
			await this.finishRecordings(options);

			options.finishWriting();
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

			let options = {
				canvas,
				ctx,
				row: 0,
				column: 0,
				sheet: 0,
				json: {},
				modelName,

				// Only used in packed mode
				atlasTextures: [],
				startX: 0,
				startY: 0,
				maxHeight: 0
			};

			if(this.directoryHandle) {
				options.saveFile = async (name, contents, options = {}) => {
					if(options.base64) {
						let byteArray;

						// This is coming from canvas
						if(typeof contents === 'string') {
							let byteCharacters = window.atob(contents);
							const byteNumbers = new Array(byteCharacters.length);
							for(let i = 0; i < byteCharacters.length; i++) {
								byteNumbers[i] = byteCharacters.charCodeAt(i);
							}
							byteArray = new Uint8Array(byteNumbers);
						}
						// This is coming from pgquant
						else {
							byteArray = contents;
						}
						contents = new Blob([byteArray], {type: 'image/png'});
					}
					let fileHandle = await this.directoryHandle.getFileHandle(name, { create: true });
					let writableHandle = await fileHandle.createWritable();
					await writableHandle.write(contents);
					await writableHandle.close();
				};
				// Don't need to do anything
				options.finishWriting = () => {
					alert('done writing files');
				};
			} else {
				let zip = new JSZip();

				options.saveFile = async (name, contents, options) => {
					zip.file(name, contents, options);
				};
				options.finishWriting = () => {
					zip.generateAsync({
						type: 'blob',
						streamFiles: true
					}).then((content) => {
						saveAs(content, `${modelName}.zip`);
					});
				};
			}

			return options;
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
					options.atlasTextures.forEach(atlasTexture => {
						atlasTexture.image = atlasTexture.image.replace('0.png', '.png');
					});
				}

				await this.saveImageToZip(options, sheetName);
			}

			await options.saveFile('animations.json', JSON.stringify(options.json, null, '\t'));
			if(this.recordParams.packTextures) {
				await options.saveFile('atlas.json', JSON.stringify({
					textures: options.atlasTextures
				}, null, '\t'));
			}
		},

		async drawFramesFromAnimation(name, options) {
			if(name === 'icon') {
				this.updateAngle('icon');

				let animationName = this.config.icon.animation;
				let { action, frames, animationConfig } = this.animationActions[animationName];
				await this.drawFramesFromAnimationAngle(options, action, frames, name, 'icon', animationConfig);
			} else {
				let angleNames = this.angleNames;
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
			let params = {};
			if(this.recordParams.packTextures) {
				this.mixer.update(0);
				await raf();
				for(let i = 0; i < FRAMES; i++) {
					let framePosition = this.getStartAndEndPixelsForFrame();
					if(params.trimSize) {
						params.trimSize = {
							startX: Math.min(framePosition.startX, params.trimSize.startX),
							startY: Math.min(framePosition.startY, params.trimSize.startY),
							endX: Math.max(framePosition.endX, params.trimSize.endX),
							endY: Math.max(framePosition.endY, params.trimSize.endY)
						};
					} else {
						params.trimSize = framePosition;
					}

					this.mixer.update(skipTime);
					await raf();
				}
			}

			this.setAction(action);
			// 0 update seems to fix some models starting out different than it should - peasant starts out holding gold and wood even though a 0ms update shows him starting to swing a pickaxe
			this.mixer.update(0);
			await raf();
			for(let i = 0; i < FRAMES; i++) {
				await this.drawFrameFromAnimation(options, animationName, angle, params);

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

		async drawFrameFromAnimation(options, animationName, angle, params) {
			const maxSize = this.recordParams.sheetSize / this.recordParams.frameSize;
			if(this.recordParams.packTextures) {
				let framePosition = params.trimSize;

				let drawWidth = framePosition.endX - framePosition.startX;
				let drawHeight = framePosition.endY - framePosition.startY;
				if((options.startX + drawWidth) > this.recordParams.sheetSize) {
					options.startX = 0;
					options.startY += options.maxHeight;
					options.maxHeight = 0;
					options.column = 0;
					options.row++;
				}
				// TODO: Re-implement going to the next sheet with packed textures

				options.ctx.drawImage(
					this.renderer.domElement,
					framePosition.startX,	// source x
					framePosition.startY,	// source y
					drawWidth,				// source width
					drawHeight,				// source height
					options.startX,			// dest canvas x
					options.startY,			// dest canvas y
					drawWidth,				// dest canvas width
					drawHeight				// dest canvas height
				);

				if(options.atlasTextures.length <= options.sheet) {
					options.atlasTextures.push({
						image: `${options.modelName}${options.sheet}.png`,
						frames: []		
					});
				}
				options.atlasTextures[options.sheet].frames.push({
					filename: options.atlasTextures[options.sheet].frames.length,
					rotated: false,
					trimmed: true,
					sourceSize: {
						w: this.recordParams.frameSize,
						h: this.recordParams.frameSize
					},
					spriteSourceSize: {
						x: framePosition.startX,
						y: framePosition.startY,
						w: drawWidth,
						h: drawHeight
					},
					frame: {
						x: options.startX,
						y: options.startY,
						w: drawWidth,
						h: drawHeight
					}
				});

				options.startX += drawWidth;
				options.maxHeight = Math.max(options.maxHeight, drawHeight);
			} else {
				options.ctx.drawImage(this.renderer.domElement, options.column * this.recordParams.frameSize, options.row * this.recordParams.frameSize);
			}
			
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
			if(options.column >= maxSize && !this.recordParams.packTextures) {
				options.column = 0;
				options.row++;

				if(options.row >= maxSize) {
					await this.startNewSheet(options);
				}
			}
		},
		getStartAndEndPixelsForFrame() {
			let canvas = document.createElement('canvas');
			canvas.width = this.renderer.domElement.width;
			canvas.height = this.renderer.domElement.height;
			let ctx = canvas.getContext('2d');
			ctx.drawImage(this.renderer.domElement, 0, 0);

			let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			let pixelArray = imageData.data;

			let startX = canvas.width;
			let endX = 0;
			let startY = canvas.height;
			let endY = 0;

			for(let p = 0; p < pixelArray.length / 4; p++) {
				let index = 4 * p;
				let alpha = pixelArray[index + 3];

				if(alpha !== 0) {
					let x = p % canvas.width;
					let y = Math.floor(p / canvas.width);

					startX = Math.min(startX, Math.max(0, x - 1));
					startY = Math.min(startY, Math.max(0, y - 1));

					endX = Math.max(endX, x + 1);
					endY = Math.max(endY, y + 1);
				}
			}

			// Probably will only happen on empty models, but worth handling anyways
			if(startX === canvas.width) {
				startX = 0;
			}
			if(startY === canvas.height) {
				startY = 0;
			}
			if(endX === 0) {
				endX = canvas.width;
			}
			if(endY === 0) {
				endY = canvas.height;
			}

			return {
				startX,
				endX,
				startY,
				endY
			};
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

			await options.saveFile(sheetName, outputData, { base64: true });
		},
		async startNewSheet(options) {
			await this.saveImageToZip(options, `${options.modelName}${options.sheet}.png`);
			this.resetSheetCanvas(options);
			options.sheet++;
		},
		resetSheetCanvas(options) {
			options.row = 0;
			options.column = 0;
			options.startX = 0;
			options.startY = 0;
			options.maxHeight = 0;
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

		addAnimationFromAction(animation, animationName) {
			if(!animationName) {
				animationName = animation.name;
				Object.keys(this.config.animations).forEach(animationKey => {
					if(animation.name === this.config.animations[animationKey].name) {
						animationName = animationKey;
					}
				});
			}

			let animationAction = this.mixer.clipAction(animation);

			// Add actions to folders
			this.animationsFolder.add({
				[animationName]: () => {
					this.setAction(animationAction);
				}
			}, animationName);

			this.actionsFolder.add({
				[animationName]: () => {
					this.recordAnimationAsSheet(animationName);
				}
			}, animationName);

			let frames = this.recordParams.frames;
			let animationConfig = null;
			if(this.config.animations[animationName]) {
				if(this.config.animations[animationName].frames) {
					frames = this.config.animations[animationName].frames;
				}
				animationConfig = this.config.animations[animationName];
			}

			this.addAnimation(animationName, animationAction, frames, animationConfig);
		},
		addAnimation(name, action, frames, animationConfig) {
			this.animationActions[name] = {
				frames,
				action,
				animationConfig
			};
		},
		updateAngle(angleName) {
			let angles = this.angles[angleName] || this.angles.spritesheet;
			this.camera.position.set(...angles.position);
			this.controls.target.set(...angles.target);
			this.directionalLight.position.set(...angles.light);
			this.directionalLight.castShadow = this.recordParams.shadow;

			let startAngle = this.config.startAngle || 270;
			let angle = angleName;
			if(angles.startAngle) {
				angle = angles.startAngle;
			}
			this.currentModel.rotation.set(0, angleToRadians(angle - startAngle), 0);
			this.currentAngleName = angleName;
			this.floorMaterial.opacity = this.recordParams.shadowOpacity;

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
			this.recordParams.distance = config.distance || 1.25;
			this.recordParams.viewAngle = config.viewAngle === undefined ? 60 : config.viewAngle;
			if(config.sheetSize) {
				this.recordParams.sheetSize = config.sheetSize;
			}
			if(config.frameSize) {
				this.setRenderSize(config.frameSize);
			}
			this.recordParams.shadow = config.shadow !== undefined ? config.shadow : true;
			this.recordParams.shadowHeightAngle = config.shadowHeightAngle !== undefined ? config.shadowHeightAngle : 90;
			this.recordParams.shadowSideAngle = config.shadowSideAngle !== undefined ? config.shadowSideAngle : 70;
			this.recordParams.shadowDistance = config.shadowDistance !== undefined ? config.shadowDistance : (this.recordParams.distance || 1);
			this.recordParams.shadowOpacity = config.shadowOpacity !== undefined ? config.shadowOpacity : (0.6);
			this.recordParams.packTextures = config.packTextures !== undefined ? config.packTextures : false;
			if(config.directionalLightIntensity) {
				this.directionalLight.intensity = config.directionalLightIntensity;
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
					if(!config.animations[missingAnimation].name.toLowerCase().includes('.fbx')) {
						return;
					}

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

			let model = this.currentModel = await fbxLoadPromise(fbxLoader, modelName);
			model.scale.set(0.01, 0.01, 0.01);

			model.traverse(it => {
				if(it.isMesh) {
					it.receiveShadow = false;
					it.castShadow = true;
				}
			});
			this.mixer = new THREE.AnimationMixer(model);

			var box = new THREE.Box3().setFromObject(model);
			this.modelDimensions = {
				x: box.max.x - box.min.x,
				y: box.max.y - box.min.y,
				z: box.max.z - box.min.z
			};
			this.floorPlane.position.set(0, box.min.y, 0);
			this.angles = generateAngles(this.modelDimensions, this.config, this.recordParams);
			this.updateAngle('270');

			while(this.anglesFolder.__controllers.length) {
				this.anglesFolder.remove(this.anglesFolder.__controllers[0]);
			}
			let angleUpdater = {
				icon: () => {
					this.updateAngle('icon');
				}
			};
			let angleNames = [];
			if(this.config.angles) {
				angleNames = this.config.angles;

				if(!angleNames.includes(270)) {
					this.updateAngle(angleNames[0]);
				}
			} else {
				let anglesCount = this.config.anglesCount || DEFAULT_ANGLES_COUNT;
				for(let i = 0; i < anglesCount; i++) {
					let angle = (360 / anglesCount) * i;
					// Can just mirror left/right to save space
					if(angle > 90 && angle < 270) {
						continue;
					}

					angleNames.push(angle);
				}
			}
			angleNames.forEach((angleName) => {
				angleUpdater[angleName] = () => {
					this.updateAngle(angleName);
				};
				this.anglesFolder.add(angleUpdater, angleName);
			});
			this.anglesFolder.add(angleUpdater, 'icon');
			this.angleNames = angleNames;

			this.scene.add(model);
			if(this.modelFolder) {
				while(this.modelFolder.__controllers.length) {
					this.modelFolder.remove(this.modelFolder.__controllers[0]);
				}
			} else {
				this.modelFolder = this.gui.addFolder('Model');
			}
			this.modelFolder.add(model.position, 'x', -4, 4).step(0.1).name('Position X').listen();
			this.modelFolder.add(model.position, 'y', -4, 4).step(0.1).name('Position Y').listen();
			this.modelFolder.add(model.position, 'z', -4, 4).step(0.1).name('Position Z').listen();
			this.modelFolder.add(model.rotation, 'x', -4, 4).step(0.1).name('Rotation X').listen();
			this.modelFolder.add(model.rotation, 'y', -4, 4).step(0.1).name('Rotation Y').listen();
			this.modelFolder.add(model.rotation, 'z', -4, 4).step(0.1).name('Rotation Z').listen();
			this.modelFolder.add(this.recordParams, 'distance', 0.5, 5).step(0.05).name('Distance').listen().onChange((newValue) => {
				this.recordParams.distance = newValue;
				this.angles = generateAngles(this.modelDimensions, this.config, this.recordParams);
				this.updateAngle(this.currentAngleName);
			});
			this.modelFolder.add(this.recordParams, 'viewAngle', 0, 89).step(1).name('View Angle').listen().onChange((newValue) => {
				this.recordParams.viewAngle = newValue;
				this.angles = generateAngles(this.modelDimensions, this.config, this.recordParams);
				this.updateAngle(this.currentAngleName);
			});

			if(this.meshPartsFolder) {
				while(this.meshPartsFolder.__controllers.length) {
					this.meshPartsFolder.remove(this.meshPartsFolder.__controllers[0]);
				}
			} else {
				this.meshPartsFolder = this.gui.addFolder('Mesh Parts');
			}
			let meshes = this.getMeshes(model);
			meshes.sort((a, b) => a.name.localeCompare(b.name));
			if(this.config.meshesEnabled) {
				meshes.forEach(mesh => {
					if(!this.config.meshesEnabled.includes(mesh.name)) {
						mesh.visible = false;
					}
				});
			}
			meshes.forEach(mesh => {
				this.meshPartsFolder.add(mesh, 'visible').name(mesh.name);
			});

			while(this.animationsFolder.__controllers.length) {
				this.animationsFolder.remove(this.animationsFolder.__controllers[0]);
			}
			while(this.actionsFolder.__controllers.length >= 3) {
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
				this.addAnimationFromAction(animationObject.animations[0], animationName);
			}
			model.animations.forEach(animation => {
				this.addAnimationFromAction(animation);
			});

			if(this.config.icon) {
				this.actionsFolder.add({
					icon: () => {
						this.recordAnimationAsSheet('icon');
					}
				}, 'icon');
			}

			this.modelReady = true;
			if(this.animationActions.idle) {
				this.setAction(this.animationActions.idle.action);
			} else if(Object.values(this.animationActions).length > 0) {
				this.setAction(Object.values(this.animationActions)[0].action);
			}
		},
		getMeshes(group) {
			let meshes = [];
			group.children.forEach(child => {
				if(child.constructor.name === 'SkinnedMesh' || child.constructor.name === 'Mesh') {
					meshes.push(child);
				} else {
					meshes.push(...this.getMeshes(child));
				}
			});

			return meshes;
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
			this.loadConfigFromFiles(files);
			this.directoryHandle = null;
		},
		loadConfigFromFiles(files) {
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
		},

		async openFolder() {
			// Neither passing writable or mode: readwrite seems to work.  Leaving in in case they add support in the future
			let directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite', writable: true });
			await directoryHandle.requestPermission({ mode: 'readwrite' });

			let files = [];
			await this.addFilesFromFolder(directoryHandle, files);
			this.loadConfigFromFiles(files);
			this.directoryHandle = directoryHandle;
		},
		async addFilesFromFolder(directoryHandle, files) {
			for await(let [key, handle] of directoryHandle.entries()) {
				key = key.toLowerCase();

				if(handle instanceof window.FileSystemDirectoryHandle) {
					await this.addFilesFromFolder(handle, files);
				} else if(key === 'config.json' || key.includes('fbx') || key.includes('tga')) {
					let file = await handle.getFile();
					files.push(file);
				}
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
		light2.castShadow = true;
		light2.shadow.mapSize.width = 2048;
		light2.shadow.mapSize.height = 2048;

		light2.shadow.camera.top = 2;
		light2.shadow.camera.bottom = -2;
		light2.shadow.camera.left = -2;
		light2.shadow.camera.right = 2;
		light2.shadow.camera.near = 0.1;
		light2.shadow.camera.far = 500;
		
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
		// camera.rotation.set won't work due - need to use controls.target.set when using OrbitControls for mouse handlers

		const renderer = this.renderer = new THREE.WebGLRenderer({
			// So we can save canvas to a PNG
			preserveDrawingBuffer: true,
			alpha: true
		});
		renderer.setSize(this.recordParams.frameSize, this.recordParams.frameSize);
		renderer.gammaOutput = true;
		renderer.shadowMap.enabled = true;

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
		/*cameraFolder.add(camera, 'fov', -100,100).step(1).listen();
		cameraFolder.add(camera, 'near', -100,100).step(1).listen();
		cameraFolder.add(camera, 'far', -100,100).step(1).listen();
		cameraFolder.add(camera, 'aspect', -100,100).step(1).listen();
		cameraFolder.add(camera, 'zoom', -100,100).step(0.1).listen();*/
		cameraFolder.add(camera.rotation, 'x', -4, 4).name('Rotation x').step(0.01).listen();
		cameraFolder.add(camera.rotation, 'y', -4, 4).name('Rotation y').step(0.01).listen();
		cameraFolder.add(camera.rotation, 'z', -4, 4).name('Rotation z').step(0.01).listen();
		cameraFolder.add(controls.target, 'x', -4, 4).name('Target x').step(0.01).listen();
		cameraFolder.add(controls.target, 'y', -4, 4).name('Target y').step(0.01).listen();
		cameraFolder.add(controls.target, 'z', -4, 4).name('Target z').step(0.01).listen();
		// cameraFolder.open();

		this.anglesFolder = gui.addFolder('Angles');
		// this.anglesFolder.open();

		this.actionsFolder = gui.addFolder('Actions');
		this.actionsFolder.add({
			'Save As Sheets': () => {
				this.recordAllAsSheets(this.config.name);
			}
		}, 'Save As Sheets');
		this.actionsFolder.add({
			'Open Folder': () => {
				this.openFolder();
			}
		}, 'Open Folder');
		this.actionsFolder.open();

		this.frameSettingsFolder = this.gui.addFolder('Frames');
		this.frameSettingsFolder.add(this.recordParams, 'frames', 1, 20).step(1).name('Frames').listen();
		this.frameSettingsFolder.add(this.recordParams, 'frameSize', 32, 1024).step(32).name('Frame Size').listen().onChange((newValue) => {
			renderer.setSize(newValue, newValue);
			this.onWindowResize();
		});
		this.frameSettingsFolder.add(this.recordParams, 'sheetSize', 64, 16384).step(64).name('Sheet Size').listen();
		this.frameSettingsFolder.add(this.recordParams, 'compressPNG').name('Compress PNG').listen();
		this.frameSettingsFolder.add(this.recordParams, 'packTextures').name('Pack Textures').listen();

		const lightsFolder = gui.addFolder('Lights');
		lightsFolder.add(light1, 'intensity', 0, 5).name('Ambient Light').step(0.01).listen();
		lightsFolder.add(light2, 'intensity', 0, 5).name('Directional Light').step(0.01).listen();
		lightsFolder.add(hemiLight, 'intensity', 0, 5).name('Hemisphere Light').step(0.01).listen();
		lightsFolder.add(this.recordParams, 'shadow').name('Shadows').listen().onChange(() => {
			this.updateAngle(this.currentAngleName);
		});
		lightsFolder.add(this.recordParams, 'shadowHeightAngle', 1, 179).name('Shadow Height Angle').listen().onChange(() => {
			this.angles = generateAngles(this.modelDimensions, this.config, this.recordParams);
			this.updateAngle(this.currentAngleName);
		});
		lightsFolder.add(this.recordParams, 'shadowSideAngle', 1, 179).name('Shadow Side Angle').listen().onChange(() => {
			this.angles = generateAngles(this.modelDimensions, this.config, this.recordParams);
			this.updateAngle(this.currentAngleName);
		});
		lightsFolder.add(this.recordParams, 'shadowDistance', 0.1, 5).step(0.05).name('Shadow Distance').listen().onChange(() => {
			this.angles = generateAngles(this.modelDimensions, this.config, this.recordParams);
			this.updateAngle(this.currentAngleName);
		});
		
		lightsFolder.add(this.recordParams, 'shadowOpacity', 0.05, 1).step(0.05).name('Shadow Opacity').listen().onChange(() => {
			this.updateAngle(this.currentAngleName);
		});


		let floorGeometry = new THREE.PlaneBufferGeometry(2000, 2000, 8, 8);
		let floorMaterial = new THREE.ShadowMaterial({
			opacity : 0.8
		});
		let floorPlane = new THREE.Mesh(floorGeometry, floorMaterial);
		floorPlane.castShadow = false;
		floorPlane.receiveShadow = true;
		floorPlane.rotateX(-Math.PI / 2);
		this.floorPlane = floorPlane;
		this.floorMaterial = floorMaterial;
		scene.add(floorPlane);

		const clock = new THREE.Clock();

		const animate = () => {
			requestAnimationFrame(animate);

			controls.update();

			if(this.modelReady && !this.isRecording) {
				this.mixer.update(clock.getDelta());
			}

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

.dg .cr.boolean .property-name {
	width: 80%;
}
.dg .cr.boolean .c {
	width: 0%;
}
</style>

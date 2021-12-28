<template>
	<div id="app">
		
	</div>
</template>

<script>
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader'
import { LoadingManager } from 'three/src/loaders/LoadingManager'
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader'
import Stats from 'three/examples/jsm/libs/stats.module'
import { GUI } from 'three/examples/jsm/libs/dat.gui.module'

export default {
	mounted() {
		const scene = new THREE.Scene()
		// scene.add(new THREE.AxesHelper(5))

		const light1  = new THREE.AmbientLight(0xFFFFFF, 0.3);
		light1.name = 'ambient_light';
		scene.add(light1);

		const light2  = new THREE.DirectionalLight(0xFFFFFF, 0.8 * Math.PI);
		light2.position.set(0.5, 0, 0.866); // ~60º
		light2.name = 'main_light';
		scene.add(light2);

		const hemiLight = new THREE.HemisphereLight();
		hemiLight.name = 'hemi_light';
		scene.add(hemiLight);

		const camera = new THREE.PerspectiveCamera(
			75,
			window.innerWidth / window.innerHeight,
			0.01,
			1000
		)
		camera.position.set(0, 1, 2)

		const renderer = new THREE.WebGLRenderer({
			alpha: true
		})
		renderer.setSize(window.innerWidth, window.innerHeight)
		renderer.gammaOutput = true;

		this.$el.appendChild(renderer.domElement)

		const controls = new OrbitControls(camera, renderer.domElement)
		controls.enableDamping = true
		controls.target.set(0, 1, 0)

		const manager = new LoadingManager();
		manager.addHandler( /\.tga$/i, new TGALoader() );

		let mixer
		let modelReady = false
		const animationActions = []
		let activeAction
		let lastAction
		const fbxLoader = new FBXLoader(manager)

		fbxLoader.load(
			'models/ToonRTS_demo_Knight/model.fbx',
			(object) => {
				object.scale.set(0.01, 0.01, 0.01)
				mixer = new THREE.AnimationMixer(object)

				// Model doesn't have any
				/*const animationAction = mixer.clipAction(
					object.animations[0]
				)
				animationActions.push(animationAction)
				animationsFolder.add(animations, 'default')
				activeAction = animationActions[0]*/

				scene.add(object)
				console.log('done with initial model');

				//add an animation from another file
				fbxLoader.load(
					'models/ToonRTS_demo_Knight/model@idle.fbx',
					(object) => {
						console.log('loaded idle')

						const animationAction = mixer.clipAction(
							object.animations[0]
						)
						animationActions.push(animationAction)
						animationsFolder.add(animations, 'idle')

						//add an animation from another file
						fbxLoader.load(
							'models/ToonRTS_demo_Knight/model@walk.fbx',
							(object) => {
								console.log('loaded walk')
								const animationAction = mixer.clipAction(
									object.animations[0]
								)
								animationActions.push(animationAction)
								animationsFolder.add(animations, 'walk')
								activeAction = animationAction;

								//add an animation from another file
								fbxLoader.load(
									'models/ToonRTS_demo_Knight/model@run.fbx',
									(object) => {
										console.log('loaded run');
										//console.dir((object as THREE.Object3D).animations[0])
										const animationAction = mixer.clipAction(
											object.animations[0]
										)
										animationActions.push(animationAction)
										animationsFolder.add(animations, 'run')

										fbxLoader.load(
											'models/ToonRTS_demo_Knight/model@attack.fbx',
											(object) => {
												console.log('loaded attack');
												//console.dir((object as THREE.Object3D).animations[0])
												const animationAction = mixer.clipAction(
													object.animations[0]
												)
												animationActions.push(animationAction)
												animationsFolder.add(animations, 'attack')

												modelReady = true
												setAction(animationActions[0])
											},
											(xhr) => {
												console.log(
													(xhr.loaded / xhr.total) * 100 + '% loaded'
												)
											},
											(error) => {
												console.log(error)
											}
										)
									},
									(xhr) => {
										console.log(
											(xhr.loaded / xhr.total) * 100 + '% loaded'
										)
									},
									(error) => {
										console.log(error)
									}
								)
							},
							(xhr) => {
								console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
							},
							(error) => {
								console.log(error)
							}
						)
					},
					(xhr) => {
						console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
					},
					(error) => {
						console.log(error)
					}
				)
			},
			(xhr) => {
				console.log((xhr.loaded / xhr.total) * 100 + '% loaded')
			},
			(error) => {
				console.log(error)
			}
		)

		window.addEventListener('resize', onWindowResize, false)
		function onWindowResize() {
			camera.aspect = window.innerWidth / window.innerHeight
			camera.updateProjectionMatrix()
			renderer.setSize(window.innerWidth, window.innerHeight)
			render()
		}

		const stats = Stats()
		this.$el.appendChild(stats.dom)

		const animations = {
			idle: function () {
				setAction(animationActions[0])
			},
			walk: function () {
				setAction(animationActions[1])
			},
			run: function () {
				setAction(animationActions[2])
			},
			attack: function () {
				setAction(animationActions[3])
			}
		}

		const setAction = (toAction) => {
			if (toAction != activeAction) {
				lastAction = activeAction
				activeAction = toAction
				//lastAction.stop()
				lastAction.fadeOut(1)
				activeAction.reset()
				activeAction.fadeIn(1)
				activeAction.play()
			}
		}

		const gui = new GUI()
		const animationsFolder = gui.addFolder('Animations')
		animationsFolder.open()


		const clock = new THREE.Clock()

		function animate() {
			requestAnimationFrame(animate)

			controls.update()

			if (modelReady) mixer.update(clock.getDelta())

			render()

			stats.update()
		}

		function render() {
			renderer.render(scene, camera)
		}

		animate();
	}
};
</script>

<style>
body {
	margin: 0;
}
</style>

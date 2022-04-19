# Convert FBX 3D models to 2D spritesheets
Convert FBX 3D models to 16-directional 2D spritesheets.  Only tested with a few FBX models, so others will probably need additional work.  Works by dragging a group of files onto the page to load a new model.  There is also an option to open the folder directly and save without requiring you to download a zip of files.  Only right poses are generated since you can just flip during render to get a left version.

View demo at https://daneren2005.github.io/3d-to-spritesheet/

![Screenshot](https://github.com/daneren2005/3d-to-spritesheet/blob/dev/readme/demo-preview.png?raw=true)

An example sheet generated from this:

![Spritesheet](https://github.com/daneren2005/3d-to-spritesheet/blob/dev/readme/demo-spritesheet.png?raw=true)

You need to include the base model, texture, and any animations to be rendered.  The animation models need to be named `model@animation.fbx` in order to work correctly.  You can also include a `config.json` with details about which files are being added and how many frames are rendered per animation:

```
{
	"model": "model.FBX",
	"texture": "DemoTexture.tga",
	"animations": {
		"idle": {
			"name": "model@idle.FBX",
			"frames": 1
		},
		"run": {
			"name": "model@run.FBX"
		},
		"attack": {
			"name": "model@attack.FBX",
			"frames": 8
		}
	},
	"frameSize": 128,
	"sheetSize": 2048
}
```

You can view each of the loaded animations from the animations tab.  You can generate individual animation frames or an entire spritesheet all at once for all animations from the Actions tab.  Defaults to 4 frames per animation and 256px frames on a 4096px sheet These options can be configured in the Frames tab or in the config file.

The view angle defaults to 60 degrees, and can be configured with `"viewAngle": 45`.  The distance defaults to 1.25x the models size away, and can be configured with `"distance": 1.5`.  Both of these can be played with on the Models tab to see what the optimal settings are.  The number of angles generated for each animation defaults to 16 (seems to give pretty close to real 3d movement), but can be configured with `"anglesCount": 8`.  Shadow defaults to on and slightly to the right, but can configured.

## `config.json` params
| Param  | Default | Description |
| ------------- | ------------- | ------------- |
| name 				| <b>REQUIRED</b>	| Name that the zip file and the spritesheet is named |
| model 			| <b>REQUIRED</b>	| Filename of the model we are loading |
| texture 			| <b>REQUIRED</b>	| Filename of the model's texture |
| animations 		| <b>REQUIRED</b>	| Object containing a list of named animations.  In the example for "idle" above, the name is the filename of the file containing the animation, and the frames is how many frames that animation is rendered for.  Animations default to 4 frames if not specified. |
| distance 			| 1.25 				| Distance away from the model.  1 means the camera is equal to the greatest x, y, or z size of the model reported by Three JS |
| viewAngle 		| 60 				| The angle that the camera is looking down at the model |
| anglesCount 		| 16 				| The number of angles that are captured around the model.  Most basic pixel art is only done with 4 angles (left, right, up, down).  16 seems to give Starcraft 1 levels of quality. |
| frameSize 		| 256 				| How many pixels each frame takes up. The default of 256 / 4096 allows for 256 frames per sheet.  128 seems to be the sweet spot for good enough small file sizes.  256 looks pretty good but is significantly larger than 128.  YMMV depending on how close your camera is to the units. |
| sheetSize 		| 4096 				| The total size of each sprite sheet. Different devices have different limitations on the size of a single texture. |
| shadow 			| true 				| Whether to render with shadow |
| shadowHeightAngle | 90 				| The angle above the model that the light is casting a shadow from |
| shadowSideAngle 	| 70 				| The angle to the side of the model that the light is casting a shadow from |
| shadowDistance 	| 1.25 				| The distance from the model that light is casting a shadow from |
| shadowOpacity 	| 0.6 				| How light or dark the shadow is |
| packTextures 		| false				| If true we will try to pack textures in as tight as possible and generate an atlas.json you can use to get the position of each individual frame.  Didn't work too well in practice due to poor handling of different animations/frames having different width/heights from each other. |

## Project setup and running/building
```
npm install
npm start
npm run build
```



### Notes
* Basic 3d model preview with https://3dviewer.net/
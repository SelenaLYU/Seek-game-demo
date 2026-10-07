import bpy, os, sys

source, destination = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.abspath(source))
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(
    filepath=os.path.abspath(destination), use_selection=True, export_format='GLB',
    export_meshopt_compression_enable=True,
    export_image_format='AUTO', export_materials='EXPORT', export_animations=True,
)

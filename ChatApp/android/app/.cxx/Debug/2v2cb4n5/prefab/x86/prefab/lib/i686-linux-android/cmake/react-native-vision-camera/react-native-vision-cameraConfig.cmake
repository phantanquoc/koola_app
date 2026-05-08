if(NOT TARGET react-native-vision-camera::VisionCamera)
add_library(react-native-vision-camera::VisionCamera SHARED IMPORTED)
set_target_properties(react-native-vision-camera::VisionCamera PROPERTIES
    IMPORTED_LOCATION "D:/Desktop/APP_KOOLA/ChatApp/node_modules/react-native-vision-camera/android/build/intermediates/cxx/Debug/1l5z1g45/obj/x86/libVisionCamera.so"
    INTERFACE_INCLUDE_DIRECTORIES "D:/Desktop/APP_KOOLA/ChatApp/node_modules/react-native-vision-camera/android/build/headers/visioncamera"
    INTERFACE_LINK_LIBRARIES ""
)
endif()


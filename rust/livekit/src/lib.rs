use lazy_static::lazy_static;
use livekit::{Room, RoomOptions};

struct App {
    async_runtime: tokio::runtime::Runtime,
}

impl Default for App {
    fn default() -> Self {
        App {
            async_runtime: tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .unwrap(),
        }
    }
}

lazy_static! {
    static ref APP: App = App::default();
}

pub fn livekit_connect(url: String, token: String) {
    log::info!("Connecting to {} with token {}", url, token);

    APP.async_runtime.spawn(async move {
        let res = Room::connect(&url, &token, RoomOptions::default()).await;

        if let Err(err) = res {
            log::error!("Failed to connect: {}", err);
            return;
        }

        let (room, mut events) = res.unwrap();
        log::info!("Connected to room {}", String::from(room.sid().await));

        while let Some(event) = events.recv().await {
            log::info!("Received event {:?}", event);
        }
    });
}

#[cfg(target_os = "ios")]
pub mod ios {
    use std::ffi::{c_char, CStr};

    #[no_mangle]
    pub extern "C" fn livekit_connect(url: *const c_char, token: *const c_char) {
        let (url, token) = unsafe {
            let url = CStr::from_ptr(url).to_str().unwrap().to_owned();
            let token = CStr::from_ptr(token).to_str().unwrap().to_owned();
            (url, token)
        };

        super::livekit_connect(url, token);
    }
}

#[cfg(target_os = "android")]
pub mod android {
    use android_logger::Config;
    use jni::{
        sys::{jint, JNI_VERSION_1_6},
        JavaVM,
    };
    use log::LevelFilter;
    use std::os::raw::c_void;

    #[allow(non_snake_case)]
    #[no_mangle]
    pub extern "C" fn JNI_OnLoad(vm: JavaVM, _: *mut c_void) -> jint {
        android_logger::init_once(
            Config::default()
                .with_max_level(LevelFilter::Debug)
                .with_tag("livekit-rustexample"),
        );

        log::info!("JNI_OnLoad, initializing LiveKit");
        livekit::webrtc::android::initialize_android(&vm);
        JNI_VERSION_1_6
    }

    #[allow(non_snake_case)]
    #[no_mangle]
    pub extern "C" fn Java_io_livekit_rustexample_App_connect(
        mut env: jni::JNIEnv,
        _: jni::objects::JClass,
        url: jni::objects::JString,
        token: jni::objects::JString,
    ) {
        let url: String = env.get_string(&url).unwrap().into();
        let token: String = env.get_string(&token).unwrap().into();

        super::livekit_connect(url, token);
    }
}





// use lazy_static::lazy_static;
// use livekit::{
//     options::TrackPublishOptions,
//     track::{LocalAudioTrack, LocalTrack, TrackSource},
//     webrtc::{
//         audio_source::native::NativeAudioSource,
//         prelude::{AudioFrame, AudioSourceOptions, RtcAudioSource},
//     },
//     Room, RoomOptions,
// };
// use std::sync::{Arc, Mutex};
// use tokio::sync::mpsc;

// struct AppState {
//     room: Option<Arc<Room>>,
//     audio_source: Option<NativeAudioSource>,
//     event_task: Option<tokio::task::JoinHandle<()>>,
// }

// struct App {
//     async_runtime: tokio::runtime::Runtime,
//     state: Arc<Mutex<AppState>>,
// }

// impl Default for App {
//     fn default() -> Self {
//         App {
//             async_runtime: tokio::runtime::Builder::new_multi_thread()
//                 .enable_all()
//                 .build()
//                 .unwrap(),
//             state: Arc::new(Mutex::new(AppState {
//                 room: None,
//                 audio_source: None,
//                 event_task: None,
//             })),
//         }
//     }
// }

// lazy_static! {
//     static ref APP: App = App::default();
// }

// pub fn livekit_connect(url: String, token: String, sample_rate: u32, num_channels: u32) -> bool {
//     log::info!("Connecting to {} with token {}", url, token);
    
//     let state = APP.state.clone();
    
//     APP.async_runtime.block_on(async move {
//         // Disconnect if already connected
//         {
//             let mut state_guard = state.lock().unwrap();
//             if state_guard.room.is_some() {
//                 log::warn!("Already connected, disconnecting first");
//                 if let Some(room) = state_guard.room.take() {
//                     let _ = room.close().await;
//                 }
//                 if let Some(task) = state_guard.event_task.take() {
//                     task.abort();
//                 }
//                 state_guard.audio_source = None;
//             }
//         }
        
//         let res = Room::connect(&url, &token, RoomOptions::default()).await;
//         if let Err(err) = res {
//             log::error!("Failed to connect: {}", err);
//             return false;
//         }
        
//         let (room, mut events) = res.unwrap();
//         let room = Arc::new(room);
//         log::info!("Connected to room: {} - {}", room.name(), room.sid().await);
        
//         // Create audio source and track
//         let source = NativeAudioSource::new(
//             AudioSourceOptions::default(),
//             sample_rate,
//             num_channels,
//             1000, // 1 second buffer
//         );
        
//         let track = LocalAudioTrack::create_audio_track(
//             "mobile_audio",
//             RtcAudioSource::Native(source.clone())
//         );
        
//         // Publish the track
//         if let Err(err) = room.local_participant()
//             .publish_track(
//                 LocalTrack::Audio(track),
//                 TrackPublishOptions {
//                     source: TrackSource::Microphone,
//                     ..Default::default()
//                 },
//             )
//             .await
//         {
//             log::error!("Failed to publish track: {}", err);
//             let _ = room.close().await;
//             return false;
//         }
        
//         // Store room and source in state
//         {
//             let mut state_guard = state.lock().unwrap();
//             state_guard.room = Some(room.clone());
//             state_guard.audio_source = Some(source);
//         }
        
//         // Spawn event handler task
//         let state_clone = state.clone();
//         let task = tokio::spawn(async move {
//             while let Some(event) = events.recv().await {
//                 log::debug!("Received event: {:?}", event);
                
//                 // Check if room was disconnected
//                 use livekit::RoomEvent;
//                 if matches!(event, RoomEvent::Disconnected { .. }) {
//                     log::info!("Room disconnected");
//                     let mut state_guard = state_clone.lock().unwrap();
//                     state_guard.room = None;
//                     state_guard.audio_source = None;
//                     break;
//                 }
//             }
//         });
        
//         {
//             let mut state_guard = state.lock().unwrap();
//             state_guard.event_task = Some(task);
//         }
        
//         true
//     })
// }

// pub fn livekit_disconnect() -> bool {
//     log::info!("Disconnecting from room");
    
//     let state = APP.state.clone();
    
//     APP.async_runtime.block_on(async move {
//         let mut state_guard = state.lock().unwrap();
        
//         if let Some(task) = state_guard.event_task.take() {
//             task.abort();
//         }
        
//         if let Some(room) = state_guard.room.take() {
//             if let Err(err) = room.close().await {
//                 log::error!("Failed to close room: {}", err);
//                 return false;
//             }
//         }
        
//         state_guard.audio_source = None;
//         true
//     })
// }

// pub fn livekit_add_pcm(
//     pcm_data: &[i16],
//     sample_rate: u32,
//     num_channels: u32,
// ) -> bool {
//     let state = APP.state.clone();
//     let pcm_data = pcm_data.to_vec();
    
//     APP.async_runtime.block_on(async move {
//         let state_guard = state.lock().unwrap();
        
//         if let Some(source) = &state_guard.audio_source {
//             let samples_per_channel = (pcm_data.len() / num_channels as usize) as u32;
            
//             let audio_frame = AudioFrame {
//                 data: pcm_data.into(),
//                 num_channels,
//                 sample_rate,
//                 samples_per_channel,
//             };
            
//             if let Err(err) = source.capture_frame(&audio_frame).await {
//                 log::error!("Failed to capture frame: {}", err);
//                 return false;
//             }
            
//             true
//         } else {
//             log::error!("Not connected to room or audio source not initialized");
//             false
//         }
//     })
// }

// pub fn livekit_is_connected() -> bool {
//     APP.state.lock().unwrap().room.is_some()
// }

// #[cfg(target_os = "ios")]
// pub mod ios {
//     use std::ffi::{c_char, CStr};
//     use std::os::raw::c_void;
//     use std::slice;
    
//     #[no_mangle]
//     pub extern "C" fn livekit_connect(
//         url: *const c_char,
//         token: *const c_char,
//         sample_rate: u32,
//         num_channels: u32,
//     ) -> bool {
//         let (url, token) = unsafe {
//             let url = CStr::from_ptr(url).to_str().unwrap().to_owned();
//             let token = CStr::from_ptr(token).to_str().unwrap().to_owned();
//             (url, token)
//         };
//         super::livekit_connect(url, token, sample_rate, num_channels)
//     }
    
//     #[no_mangle]
//     pub extern "C" fn livekit_disconnect() -> bool {
//         super::livekit_disconnect()
//     }
    
//     #[no_mangle]
//     pub extern "C" fn livekit_add_pcm(
//         pcm_data: *const i16,
//         pcm_data_len: usize,
//         sample_rate: u32,
//         num_channels: u32,
//     ) -> bool {
//         let pcm_slice = unsafe {
//             slice::from_raw_parts(pcm_data, pcm_data_len)
//         };
//         super::livekit_add_pcm(pcm_slice, sample_rate, num_channels)
//     }
    
//     #[no_mangle]
//     pub extern "C" fn livekit_is_connected() -> bool {
//         super::livekit_is_connected()
//     }
// }

// #[cfg(target_os = "android")]
// pub mod android {
//     use android_logger::Config;
//     use jni::{
//         objects::{JByteArray, JClass, JString},
//         sys::{jboolean, jint, JNI_FALSE, JNI_TRUE, JNI_VERSION_1_6},
//         JNIEnv, JavaVM,
//     };
//     use log::LevelFilter;
//     use std::os::raw::c_void;
    
//     #[allow(non_snake_case)]
//     #[no_mangle]
//     pub extern "C" fn JNI_OnLoad(vm: JavaVM, _: *mut c_void) -> jint {
//         android_logger::init_once(
//             Config::default()
//                 .with_max_level(LevelFilter::Debug)
//                 .with_tag("livekit-rust"),
//         );
//         log::info!("JNI_OnLoad, initializing LiveKit");
//         livekit::webrtc::android::initialize_android(&vm);
//         JNI_VERSION_1_6
//     }
    
//     #[allow(non_snake_case)]
//     #[no_mangle]
//     pub extern "C" fn Java_io_livekit_rustexample_LiveKitClient_connect(
//         mut env: JNIEnv,
//         _: JClass,
//         url: JString,
//         token: JString,
//         sample_rate: jint,
//         num_channels: jint,
//     ) -> jboolean {
//         let url: String = env.get_string(&url).unwrap().into();
//         let token: String = env.get_string(&token).unwrap().into();
        
//         if super::livekit_connect(url, token, sample_rate as u32, num_channels as u32) {
//             JNI_TRUE
//         } else {
//             JNI_FALSE
//         }
//     }
    
//     #[allow(non_snake_case)]
//     #[no_mangle]
//     pub extern "C" fn Java_io_livekit_rustexample_LiveKitClient_disconnect(
//         _env: JNIEnv,
//         _: JClass,
//     ) -> jboolean {
//         if super::livekit_disconnect() {
//             JNI_TRUE
//         } else {
//             JNI_FALSE
//         }
//     }
    
//     #[allow(non_snake_case)]
//     #[no_mangle]
//     pub extern "C" fn Java_io_livekit_rustexample_LiveKitClient_addPcm(
//         mut env: JNIEnv,
//         _: JClass,
//         pcm_data: JByteArray,
//         sample_rate: jint,
//         num_channels: jint,
//     ) -> jboolean {
//         // Convert byte array to i16 slice
//         let pcm_bytes = env.convert_byte_array(&pcm_data).unwrap();
        
//         // Convert bytes to i16 samples (assuming little-endian)
//         let pcm_samples: Vec<i16> = pcm_bytes
//             .chunks_exact(2)
//             .map(|chunk| i16::from_le_bytes([chunk[0] as u8, chunk[1] as u8]))
//             .collect();
        
//         if super::livekit_add_pcm(&pcm_samples, sample_rate as u32, num_channels as u32) {
//             JNI_TRUE
//         } else {
//             JNI_FALSE
//         }
//     }
    
//     #[allow(non_snake_case)]
//     #[no_mangle]
//     pub extern "C" fn Java_io_livekit_rustexample_LiveKitClient_isConnected(
//         _env: JNIEnv,
//         _: JClass,
//     ) -> jboolean {
//         if super::livekit_is_connected() {
//             JNI_TRUE
//         } else {
//             JNI_FALSE
//         }
//     }
// }
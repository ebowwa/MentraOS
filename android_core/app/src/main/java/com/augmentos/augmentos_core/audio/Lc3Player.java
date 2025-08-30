package com.augmentos.augmentos_core.audio;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.os.AsyncTask;
import android.os.Environment;
import android.util.Log;
import android.widget.Toast;

import com.augmentos.smartglassesmanager.cpp.L3cCpp;
import com.augmentos.augmentos_core.audio.ByteUtilAudioPlayer;

import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.concurrent.ArrayBlockingQueue;

public class Lc3Player extends Thread{
    private Context mContext;
    private AudioTrack mTrack;
    private volatile boolean isPlaying = false;
    private int bufferSize;
    private final int mSampleRate = 16000 ; // 44100;
//    private int mChannelConfig  = AudioFormat.CHANNEL_CONFIGURATION_MONO;
    private int mChannelConfig = AudioFormat.CHANNEL_OUT_MONO;
    //private int mChannelConfig = AudioFormat.CHANNEL_OUT_STEREO;
    private int mChannelRecordConfig = AudioFormat.CHANNEL_IN_MONO;
    private final int mEncoding = AudioFormat.ENCODING_PCM_16BIT;
    private long mDecorderHandle = -1;
    private ArrayBlockingQueue<byte[]> mQueue;

    public Lc3Player(Context context)
    {
        mContext = context;
        mQueue = new ArrayBlockingQueue(100);
    }

    public void init()
    {
        if(mTrack != null)
            return;
        bufferSize = AudioTrack.getMinBufferSize(mSampleRate, mChannelConfig, mEncoding)*4;
        Log.e("_test_", "lc3 bufferSize="+bufferSize);
        mTrack = new AudioTrack(AudioManager.STREAM_MUSIC, mSampleRate, mChannelConfig, mEncoding, bufferSize, AudioTrack.MODE_STREAM);
//        mTrack.setStereoVolume(0.8f,0.8f);
        mTrack.setVolume(1.0f);
        mTrack.setPlaybackRate(mSampleRate);
        mDecorderHandle = L3cCpp.initDecoder();
        Log.e("_test_", "lc3 decoder handle="+mDecorderHandle);
    }

    public void startPlay()
    {
        isPlaying = true;
        this.start();
        if(mTrack != null)
        {
            mTrack.play();
        }
        startRec();
    }

    private byte[] mRecvBuffer = new byte[200*10];
    private byte[]mBuffer = new byte[200];
    private byte[]mTestBuffer = new byte[40];
    public void write(byte[] data, int offset, int size)
    {
        if(size != 202)
            return;
        if(!mQueue.offer(data))
        {
            Log.e("_test_","+++++++++ addFrame fail");
        }
    }
    public void write1(byte[] data, int offset, int size)
    {
        if(size != 202)
            return;
        for(int i = 0;i < 5; i++)
        {
            System.arraycopy(data, i*40 + 2, mTestBuffer, 0, 40);
            byte []decData = L3cCpp.decodeLC3(mDecorderHandle, mTestBuffer);
            if(decData != null)
                mTrack.write(decData, 0, decData.length);
        }
    }
    public void write2(byte[] data, int offset, int size)
    {
        if(size != 202)
            return;
        System.arraycopy(data, 2, mBuffer, 0, 200);
        byte []decData = L3cCpp.decodeLC3(mDecorderHandle, mBuffer);
        if(decData == null)
        {
            Log.e("_test_", "lc3 decoder data null");
            return;
        }
        Log.e("_test_", "lc3 decoder data seq="+ ByteUtilAudioPlayer.bytetoHexString(data[1])+",size="+decData.length+",ori size="+size);
        mTrack.write(decData, 0, decData.length);
    }
    public void stopPlay()
    {
        isPlaying = false;
        interrupt(); // Properly interrupt the thread
        
        // Wait for thread to finish before cleaning up resources
        try {
            join(1000); // Wait up to 1 second for thread to terminate
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        
        synchronized (this) {
            if(mTrack != null)
            {
                try {
                    mTrack.stop();
                    mTrack.release();
                } catch (Exception e) {
                    Log.e("_test_", "Error stopping AudioTrack", e);
                } finally {
                    mTrack = null;
                }
                L3cCpp.freeDecoder(mDecorderHandle);
            }
        }
        stopRec();
    }
    private int mLastSeq = 0;
    @Override
    public void run() {
        try {
            setPriority(Thread.MAX_PRIORITY);
            while (isPlaying && !Thread.currentThread().isInterrupted())
            {
                //Log.e(AvConst.TAG, "DealThread mbStartPlay="+mbStartPlay);
                byte[] data = mQueue.take();
                if(data != null && isPlaying)
                {
                    if(false)
                    {
                        for(int i = 0;i < 5; i++)
                        {
                            System.arraycopy(data, i*40 + 2, mTestBuffer, 0, 40);
                            byte []decData = L3cCpp.decodeLC3(mDecorderHandle, mTestBuffer);
                            if(decData != null) {
                                synchronized (this) {
                                    if (mTrack != null && isPlaying) {
                                        try {
                                            mTrack.write(decData, 0, decData.length);
                                        } catch (IllegalStateException e) {
                                            Log.e("_test_", "AudioTrack write failed - track released", e);
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    else
                    {
                        System.arraycopy(data, 2, mBuffer, 0, 200);
                        if(ByteUtilAudioPlayer.byte2Int(data[1]) != mLastSeq)
                        {
                            Log.e("_test_", "seq error,should be=0x"+ ByteUtilAudioPlayer.intToHexString(mLastSeq, 2)+",but seq="+ByteUtilAudioPlayer.bytetoHexString(data[1]));
                        }
                        else
                        {
                            //Log.i("_test_", "seq ok,seq=0x"+ByteUtilAudioPlayer.bytetoHexString(data[1]));
                        }
                        mLastSeq = ByteUtilAudioPlayer.byte2Int(data[1]);
                        mLastSeq = (mLastSeq + 1) % 256;
                        byte []decData = L3cCpp.decodeLC3(mDecorderHandle, mBuffer);
                        if(decData != null) {
                            synchronized (this) {
                                if (mTrack != null && isPlaying) {
                                    try {
                                        mTrack.write(decData, 0, decData.length);
                                        //Log.e("_test_", "dec="+ByteUtilAudioPlayer.outputHexString(decData, 1440, 160));
                                        //writeRecData(decData, 0, decData.length);
                                    } catch (IllegalStateException e) {
                                        Log.e("_test_", "AudioTrack write failed - track released", e);
                                        break;
                                    }
                                }
                            }
                        }
                    }

                }
            }
        } catch (InterruptedException e) {
            Log.d("_test_", "LC3Player thread interrupted - shutting down gracefully");
            Thread.currentThread().interrupt(); // Preserve interrupt status
        }
        finally {
            mQueue.clear();
            Log.d("_test_", "LC3Player thread finished");
        }
    }



//////////////////////
    private float mWave = 0;
    private boolean mIsRecording = false;
    private static String FILE_PATH = Environment.getExternalStorageDirectory().toString()+"/1111.pcm";
    private FileOutputStream mFos = null;

    private void startRec(){
        mIsRecording = true;
        mWave = 0;
        try {
            mFos = new FileOutputStream(FILE_PATH);
        } catch (FileNotFoundException e) {
        }
    }
    private void writeRecData(byte[]data, int offset, int len)
    {
        if(len == 0){
            return;
        }
        for(int i = 0; i < len; i++){
            mWave += data[i] * data[i];
        }
        if(mFos != null) {
            try {
                mFos.write(data);
                mWave = mWave / (float)len;
            } catch (IOException e) {
            }
        }
    }
    private void stopRec()
    {
        mIsRecording = false;
        if(mFos != null)
        {
            try {
                mFos.close();
            } catch (IOException e) {
            }
            mFos = null;
        }
    }
}
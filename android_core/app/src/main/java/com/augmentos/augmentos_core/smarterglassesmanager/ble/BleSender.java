import java.util.Queue;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

public abstract class BleSender {
    private  static  final int SEND_INTERVAL_DEFAULT=15;// nomal automatic send interval
    private int sendInterval=SEND_INTERVAL_DEFAULT;
    private  boolean automaticSending=true;

    private final BlockingQueue<byte[]> dataQueue = new LinkedBlockingQueue<>();
    private final ExecutorService executor;
    private final AtomicBoolean isSending = new AtomicBoolean(false);
    private final Lock bluetoothLock = new ReentrantLock();


    private BleSender(int poolSize,boolean automaticSending,int sendInterval) {
        this.executor = Executors.newFixedThreadPool(poolSize);
        this.automaticSending=automaticSending;
        this.sendInterval= sendInterval;
    }
    
    public BleSender(boolean automaticSending) {
        this(1,automaticSending,SEND_INTERVAL_DEFAULT);
    }

    public BleSender(boolean automaticSending,int sendInterval) {
        this(1,automaticSending,sendInterval);
    }

    // should implement this send method
    public abstract void sendViaBluetooth(byte[] data) throws Exception ;

    /**
     * release
     */
    public void shutdown() {
        try {
            dataQueue.clear();
            executor.shutdown();
            if (!executor.awaitTermination(5, TimeUnit.SECONDS)) {
                executor.shutdownNow();
            }
        } catch (InterruptedException e) {
            executor.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    public void clearQueue(){
        dataQueue.clear();
        isSending.set(false);
    }


    public void sendData(byte[] data) {
        try {
            dataQueue.put(data);
                startSendingIfNeeded();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    public   void unloadCurrentAndSendNextManual(){
        if(automaticSending){
            return;
        }
        if (isSending.get()){
            isSending.set(false);
        }
        startSendingIfNeeded();
    }
    private void startSendingIfNeeded() {
        if (isSending.compareAndSet(false, true)) {
           if(automaticSending){
               executor.submit(this::processQueueAuto);
           }else{
               executor.submit(this::processManual);
           }
        }
    }

    /**
     * handle sending auto by queue
     */
    private void processQueueAuto() {
        try {
                while (!dataQueue.isEmpty()) {
                    byte[] data = dataQueue.poll();
                    if (data != null) {
                        sendDataSafely(data);
                        Thread.sleep(sendInterval);
                    }
                }

        } catch (Exception e) {
        }finally {
                isSending.set(false);
                // 检查是否有新数据到达
                if (!dataQueue.isEmpty()) {
                    startSendingIfNeeded();
                }

        }
    }

    /**
     * handle sending manual next
     */
    private void processManual() {
        try {
            byte[] data = dataQueue.poll();
            if (data != null) {
                sendDataSafely(data);
            }
        } catch (Exception e) {
        }finally {
        }
    }

    private void sendDataSafely(byte[] data) {
        bluetoothLock.lock();  // 确保蓝牙资源互斥访问
        try {
            // 实际蓝牙发送操作（需替换为真实实现）
            sendViaBluetooth(data);
        } catch (Exception e) {
        } finally {
            bluetoothLock.unlock();
        }
    }


}
package com.pachax.app.plugins;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "PachaxTcpSocket")
public class PachaxTcpSocketPlugin extends Plugin {

    private static class ManagedSocket {
        String id;
        Socket socket;
        OutputStream outputStream;

        ManagedSocket(String id, Socket socket, OutputStream outputStream) {
            this.id = id;
            this.socket = socket;
            this.outputStream = outputStream;
        }
    }

    private final Map<String, ManagedSocket> activeSockets = new ConcurrentHashMap<>();

    @PluginMethod
    public void testConnection(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port", 9100);
        Integer timeoutMs = call.getInt("timeoutMs", 3000);

        if (host == null || host.trim().isEmpty()) {
            call.reject("Host/IP inválido");
            return;
        }

        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            JSObject ret = new JSObject();
            ret.put("connected", true);
            ret.put("message", "Conexión TCP exitosa a " + host + ":" + port);
            call.resolve(ret);
        } catch (java.net.SocketTimeoutException e) {
            JSObject ret = new JSObject();
            ret.put("connected", false);
            ret.put("errorType", "timeout");
            ret.put("message", "Timeout (3s) al intentar conectar con " + host + ":" + port);
            call.resolve(ret);
        } catch (java.net.ConnectException e) {
            JSObject ret = new JSObject();
            ret.put("connected", false);
            ret.put("errorType", "connection_refused");
            ret.put("message", "Conexión rechazada por " + host + ":" + port);
            call.resolve(ret);
        } catch (java.net.UnknownHostException e) {
            JSObject ret = new JSObject();
            ret.put("connected", false);
            ret.put("errorType", "host_not_found");
            ret.put("message", "Host no encontrado: " + host);
            call.resolve(ret);
        } catch (Exception e) {
            JSObject ret = new JSObject();
            ret.put("connected", false);
            ret.put("errorType", "unknown");
            ret.put("message", "Error de red: " + e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        String host = call.getString("host");
        Integer port = call.getInt("port", 9100);
        Integer timeoutMs = call.getInt("timeoutMs", 5000);

        if (host == null || host.trim().isEmpty()) {
            call.reject("Host/IP inválido");
            return;
        }

        try {
            Socket socket = new Socket();
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            socket.setSoTimeout(timeoutMs);
            socket.setTcpNoDelay(true);

            OutputStream os = socket.getOutputStream();
            String connId = "tcp_" + UUID.randomUUID().toString().substring(0, 8);

            ManagedSocket managed = new ManagedSocket(connId, socket, os);
            activeSockets.put(connId, managed);

            JSObject ret = new JSObject();
            ret.put("connectionId", connId);
            ret.put("connected", true);
            call.resolve(ret);
        } catch (java.net.SocketTimeoutException e) {
            call.reject("Timeout al conectar socket TCP: " + e.getMessage(), "TIMEOUT");
        } catch (java.net.ConnectException e) {
            call.reject("Conexión rechazada por la impresora LAN: " + e.getMessage(), "REFUSED");
        } catch (java.net.UnknownHostException e) {
            call.reject("Host no encontrado en la red: " + host, "HOST_NOT_FOUND");
        } catch (Exception e) {
            call.reject("Error de conexión TCP: " + e.getMessage(), "FAILED");
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String connectionId = call.getString("connectionId");
        String bytesBase64 = call.getString("bytesBase64");

        if (connectionId == null || !activeSockets.containsKey(connectionId)) {
            call.reject("Socket TCP no está conectado", "NOT_CONNECTED");
            return;
        }

        if (bytesBase64 == null) {
            call.reject("Payload de bytes faltante", "INVALID_PAYLOAD");
            return;
        }

        ManagedSocket managed = activeSockets.get(connectionId);
        try {
            byte[] bytes = Base64.decode(bytesBase64, Base64.DEFAULT);
            managed.outputStream.write(bytes);
            managed.outputStream.flush();

            JSObject ret = new JSObject();
            ret.put("bytesWritten", bytes.length);
            call.resolve(ret);
        } catch (Exception e) {
            // Remove socket on write failure
            closeQuietly(managed);
            activeSockets.remove(connectionId);
            call.reject("Error al escribir en el socket TCP: " + e.getMessage(), "WRITE_FAILED");
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        String connectionId = call.getString("connectionId");
        if (connectionId != null && activeSockets.containsKey(connectionId)) {
            ManagedSocket managed = activeSockets.remove(connectionId);
            closeQuietly(managed);
        }
        JSObject ret = new JSObject();
        ret.put("disconnected", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        String connectionId = call.getString("connectionId");
        boolean connected = false;
        if (connectionId != null && activeSockets.containsKey(connectionId)) {
            ManagedSocket managed = activeSockets.get(connectionId);
            connected = managed.socket != null && managed.socket.isConnected() && !managed.socket.isClosed();
        }
        JSObject ret = new JSObject();
        ret.put("connected", connected);
        call.resolve(ret);
    }

    private void closeQuietly(ManagedSocket managed) {
        if (managed == null) return;
        try {
            if (managed.outputStream != null) managed.outputStream.close();
        } catch (Exception ignored) {}
        try {
            if (managed.socket != null) managed.socket.close();
        } catch (Exception ignored) {}
    }
}

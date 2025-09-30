package com.augmentos.augmentos_core.smarterglassesmanager.eventbusmessages;

public class ProtocolVersionResponseEvent {
    private final int protocolVersion;
    private final String commit;
    private final String buildDate;
    private final String msgId;

    public ProtocolVersionResponseEvent(int protocolVersion, String commit, String buildDate, String msgId) {
        this.protocolVersion = protocolVersion;
        this.commit = commit;
        this.buildDate = buildDate;
        this.msgId = msgId;
    }

    public int getProtocolVersion() {
        return protocolVersion;
    }

    public String getCommit() {
        return commit;
    }

    public String getBuildDate() {
        return buildDate;
    }

    public String getMsgId() {
        return msgId;
    }

    public String getFormattedVersion() {
        StringBuilder formatted = new StringBuilder();
        formatted.append("Protocol v").append(protocolVersion);
        
        if (commit != null && !commit.isEmpty()) {
            formatted.append(" | ").append(commit.substring(0, Math.min(7, commit.length())));
        }
        
        if (buildDate != null && !buildDate.isEmpty()) {
            formatted.append(" | ").append(buildDate);
        }
        
        return formatted.toString();
    }
}

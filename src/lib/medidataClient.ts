/**
 * MediData ELA (Elektronische Leistungsabrechnung) API Client
 *
 * Handles communication with the MediData Box/Virtual Appliance for:
 * - Uploading XML invoices
 * - Polling transmission status
 * - Fetching participant (insurer) lists
 * - Managing responses and acknowledgments
 *
 * API Endpoints (relative to MediData Box base URL):
 * - POST /md/ela/uploads           - Upload invoice XML
 * - GET  /md/ela/status/{id}       - Check transmission status
 * - GET  /md/ela/participants      - Get list of insurers
 * - GET  /md/ela/downloads         - Get incoming messages (responses)
 * - DELETE /md/ela/downloads/{id}  - Acknowledge received message
 */

export type MediDataConfig = {
  baseUrl: string;           // e.g., "http://192.168.1.100:8100" or MediData Box URL
  clientId: string;          // X-CLIENT-ID header value
  username: string;          // Basic auth username
  password: string;          // Basic auth password
  isTestMode: boolean;
};

export type LawType = 1 | 2 | 3 | 4 | 5; // 1=KVG, 2=UVG, 3=IVG, 4=MVG, 5=VVG

export type MediDataParticipant = {
  gln: string;
  name: string;
  bagNumber: string | null;
  receiverGln: string | null;
  lawTypes: LawType[];
  tpAllowed: boolean;
  address: {
    street: string | null;
    postalCode: string | null;
    city: string | null;
  } | null;
};

export type UploadInfo = {
  type: "invoice" | "reminder" | "copy" | "storno";
  format: "xml_45" | "xml_50";
  sender: string;      // Sender GLN (clinic)
  receiver: string;    // Receiver GLN (insurer or clearing house)
  timestamp: string;   // ISO timestamp
  invoiceNumber?: string;
  lawType?: string;
  billingType?: "TG" | "TP";
};

export type UploadResult = {
  success: boolean;
  messageId: string | null;
  statusCode: number;
  errorMessage: string | null;
  rawResponse: unknown;
};

export type TransmissionStatus = {
  messageId: string;
  status: "pending" | "transmitted" | "delivered" | "accepted" | "rejected" | "error";
  statusCode: string | null;
  statusMessage: string | null;
  timestamp: string | null;
  rawResponse: unknown;
};

export type DownloadMessage = {
  id: string;
  type: string;
  sender: string;
  receiver: string;
  timestamp: string;
  content: string | null;
  rawData: unknown;
};

const LAW_TYPE_MAP: Record<string, LawType> = {
  KVG: 1,
  UVG: 2,
  IVG: 3,
  MVG: 4,
  VVG: 5,
};

/**
 * MediData ELA API Client
 */
export class MediDataClient {
  private config: MediDataConfig;
  private authHeader: string;

  constructor(config: MediDataConfig) {
    this.config = config;
    this.authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
  }

  /**
   * Get default headers for MediData API requests
   */
  private getHeaders(contentType?: string): Record<string, string> {
    const headers: Record<string, string> = {
      "X-CLIENT-ID": this.config.clientId,
      Authorization: this.authHeader,
    };
    if (contentType) {
      headers["Content-Type"] = contentType;
    }
    return headers;
  }

  /**
   * Upload an invoice XML to MediData
   *
   * @param xmlContent - The Sumex-compliant XML invoice content
   * @param uploadInfo - Metadata about the upload
   * @returns Upload result with message ID if successful
   */
  async uploadInvoice(xmlContent: string, uploadInfo: UploadInfo): Promise<UploadResult> {
    const url = `${this.config.baseUrl}/md/ela/uploads`;

    try {
      // Create form data for multipart upload
      const formData = new FormData();

      // Add the XML file
      const xmlBlob = new Blob([xmlContent], { type: "application/xml" });
      formData.append("elauploadstream", xmlBlob, "invoice.xml");

      // Add the metadata JSON
      const infoBlob = new Blob([JSON.stringify(uploadInfo)], { type: "application/json" });
      formData.append("elauploadinfo", infoBlob, "info.json");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "X-CLIENT-ID": this.config.clientId,
          Authorization: this.authHeader,
        },
        body: formData,
      });

      const responseText = await response.text();
      let responseData: unknown;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (response.ok) {
        // Extract message ID from response
        const data = responseData as Record<string, unknown>;
        const messageId = (data.id || data.messageId || data.message_id || null) as string | null;

        return {
          success: true,
          messageId,
          statusCode: response.status,
          errorMessage: null,
          rawResponse: responseData,
        };
      } else {
        const data = responseData as Record<string, unknown>;
        const errorMessage = (data.error || data.message || data.errorMessage || `HTTP ${response.status}`) as string;

        return {
          success: false,
          messageId: null,
          statusCode: response.status,
          errorMessage,
          rawResponse: responseData,
        };
      }
    } catch (error) {
      return {
        success: false,
        messageId: null,
        statusCode: 0,
        errorMessage: error instanceof Error ? error.message : "Network error",
        rawResponse: null,
      };
    }
  }

  /**
   * Check the transmission status of a previously uploaded invoice
   *
   * @param messageId - The message ID returned from uploadInvoice
   * @returns Current transmission status
   */
  async getTransmissionStatus(messageId: string): Promise<TransmissionStatus> {
    const url = `${this.config.baseUrl}/md/ela/status/${encodeURIComponent(messageId)}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      const responseText = await response.text();
      let responseData: unknown;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (response.ok) {
        const data = responseData as Record<string, unknown>;

        // Map MediData status to our status type
        const rawStatus = (data.status || data.state || "pending") as string;
        let status: TransmissionStatus["status"] = "pending";

        if (rawStatus.toLowerCase().includes("transmitted") || rawStatus.toLowerCase().includes("sent")) {
          status = "transmitted";
        } else if (rawStatus.toLowerCase().includes("delivered") || rawStatus.toLowerCase().includes("received")) {
          status = "delivered";
        } else if (rawStatus.toLowerCase().includes("accepted") || rawStatus.toLowerCase().includes("approved")) {
          status = "accepted";
        } else if (rawStatus.toLowerCase().includes("rejected") || rawStatus.toLowerCase().includes("denied")) {
          status = "rejected";
        } else if (rawStatus.toLowerCase().includes("error") || rawStatus.toLowerCase().includes("failed")) {
          status = "error";
        }

        return {
          messageId,
          status,
          statusCode: (data.statusCode || data.code || null) as string | null,
          statusMessage: (data.statusMessage || data.message || null) as string | null,
          timestamp: (data.timestamp || data.updated_at || null) as string | null,
          rawResponse: responseData,
        };
      } else {
        return {
          messageId,
          status: "error",
          statusCode: String(response.status),
          statusMessage: `HTTP ${response.status}`,
          timestamp: null,
          rawResponse: responseData,
        };
      }
    } catch (error) {
      return {
        messageId,
        status: "error",
        statusCode: null,
        statusMessage: error instanceof Error ? error.message : "Network error",
        timestamp: null,
        rawResponse: null,
      };
    }
  }

  /**
   * Fetch list of participants (insurers) from MediData
   *
   * @param lawType - Filter by law type (KVG, UVG, etc.)
   * @returns List of participants with their GLNs
   */
  async getParticipants(lawType?: LawType | string): Promise<MediDataParticipant[]> {
    let url = `${this.config.baseUrl}/md/ela/participants`;

    // Convert string law type to number if needed
    let lawTypeNum: LawType | undefined;
    if (typeof lawType === "string" && lawType in LAW_TYPE_MAP) {
      lawTypeNum = LAW_TYPE_MAP[lawType];
    } else if (typeof lawType === "number") {
      lawTypeNum = lawType;
    }

    if (lawTypeNum) {
      url += `?lawtype=${lawTypeNum}`;
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.error(`Failed to fetch participants: HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();

      // Parse participant list
      if (!Array.isArray(data)) {
        console.error("Unexpected participants response format");
        return [];
      }

      return data.map((p: Record<string, unknown>) => ({
        gln: (p.gln || p.GLN || "") as string,
        name: (p.name || p.Name || "") as string,
        bagNumber: (p.bagNumber || p.bag_number || p.BAGNumber || null) as string | null,
        receiverGln: (p.receiverGln || p.receiver_gln || p.ReceiverGLN || null) as string | null,
        lawTypes: Array.isArray(p.lawTypes) ? p.lawTypes : [lawTypeNum || 1],
        tpAllowed: Boolean(p.tpAllowed || p.tp_allowed || p.TPAllowed || false),
        address: p.address
          ? {
              street: ((p.address as Record<string, unknown>).street || null) as string | null,
              postalCode: ((p.address as Record<string, unknown>).postalCode || (p.address as Record<string, unknown>).postal_code || null) as string | null,
              city: ((p.address as Record<string, unknown>).city || null) as string | null,
            }
          : null,
      }));
    } catch (error) {
      console.error("Error fetching participants:", error);
      return [];
    }
  }

  /**
   * Fetch incoming messages (responses from insurers)
   *
   * @returns List of downloaded messages
   */
  async getDownloads(): Promise<DownloadMessage[]> {
    const url = `${this.config.baseUrl}/md/ela/downloads`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        console.error(`Failed to fetch downloads: HTTP ${response.status}`);
        return [];
      }

      const data = await response.json();

      if (!Array.isArray(data)) {
        return [];
      }

      return data.map((d: Record<string, unknown>) => ({
        id: (d.id || d.messageId || "") as string,
        type: (d.type || "unknown") as string,
        sender: (d.sender || d.from || "") as string,
        receiver: (d.receiver || d.to || "") as string,
        timestamp: (d.timestamp || d.created_at || "") as string,
        content: (d.content || d.payload || null) as string | null,
        rawData: d,
      }));
    } catch (error) {
      console.error("Error fetching downloads:", error);
      return [];
    }
  }

  /**
   * Acknowledge a downloaded message (mark as read/processed)
   *
   * @param messageId - The message ID to acknowledge
   * @returns True if acknowledged successfully
   */
  async acknowledgeDownload(messageId: string): Promise<boolean> {
    const url = `${this.config.baseUrl}/md/ela/downloads/${encodeURIComponent(messageId)}`;

    try {
      const response = await fetch(url, {
        method: "DELETE",
        headers: this.getHeaders(),
      });

      return response.ok;
    } catch (error) {
      console.error("Error acknowledging download:", error);
      return false;
    }
  }

  /**
   * Test connectivity to MediData Box
   *
   * @returns True if connection is successful
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // Try to fetch participants as a connection test
      const response = await fetch(`${this.config.baseUrl}/md/ela/participants?lawtype=1`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return { success: true, message: "Connected to MediData Box successfully" };
      } else if (response.status === 401) {
        return { success: false, message: "Authentication failed - check username/password" };
      } else if (response.status === 403) {
        return { success: false, message: "Access denied - check client ID" };
      } else {
        return { success: false, message: `HTTP ${response.status}: ${response.statusText}` };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? `Connection failed: ${error.message}` : "Connection failed",
      };
    }
  }
}

/**
 * Create a MediData client from database configuration
 */
export function createMediDataClientFromConfig(config: {
  medidata_endpoint_url: string | null;
  medidata_client_id: string | null;
  medidata_username: string | null;
  medidata_password: string | null;
  is_test_mode: boolean;
}): MediDataClient | null {
  if (!config.medidata_endpoint_url || !config.medidata_client_id || !config.medidata_username || !config.medidata_password) {
    return null;
  }

  return new MediDataClient({
    baseUrl: config.medidata_endpoint_url,
    clientId: config.medidata_client_id,
    username: config.medidata_username,
    password: config.medidata_password,
    isTestMode: config.is_test_mode,
  });
}

/**
 * Build upload info object for invoice transmission
 */
export function buildUploadInfo(params: {
  senderGln: string;
  receiverGln: string;
  invoiceNumber: string;
  lawType: string;
  billingType: "TG" | "TP";
  isReminder?: boolean;
  reminderLevel?: number;
  isStorno?: boolean;
}): UploadInfo {
  let type: UploadInfo["type"] = "invoice";
  if (params.isStorno) {
    type = "storno";
  } else if (params.isReminder && params.reminderLevel) {
    type = "reminder";
  }

  return {
    type,
    format: "xml_45",
    sender: params.senderGln,
    receiver: params.receiverGln,
    timestamp: new Date().toISOString(),
    invoiceNumber: params.invoiceNumber,
    lawType: params.lawType,
    billingType: params.billingType,
  };
}

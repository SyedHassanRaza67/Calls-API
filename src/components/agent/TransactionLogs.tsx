import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Download, Filter } from "lucide-react";

// Mock data
const mockTransactions = [
  { id: "TXN001", type: "SMS", endpoint: "/v1/sms/send", status: "success", credits: 1, date: "2024-01-09 14:32:15" },
  { id: "TXN002", type: "Voice", endpoint: "/v1/voice/call", status: "success", credits: 5, date: "2024-01-09 14:28:42" },
  { id: "TXN003", type: "Verify", endpoint: "/v1/verify/otp", status: "success", credits: 2, date: "2024-01-09 14:25:10" },
  { id: "TXN004", type: "SMS", endpoint: "/v1/sms/send", status: "failed", credits: 0, date: "2024-01-09 14:22:33" },
  { id: "TXN005", type: "Voice", endpoint: "/v1/voice/call", status: "success", credits: 8, date: "2024-01-09 14:18:55" },
  { id: "TXN006", type: "SMS", endpoint: "/v1/sms/bulk", status: "success", credits: 15, date: "2024-01-09 14:15:20" },
  { id: "TXN007", type: "Number", endpoint: "/v1/numbers/provision", status: "success", credits: 50, date: "2024-01-09 14:10:08" },
  { id: "TXN008", type: "Verify", endpoint: "/v1/verify/check", status: "success", credits: 1, date: "2024-01-09 14:05:45" },
];

export function TransactionLogs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredTransactions = mockTransactions.filter((txn) => {
    const matchesSearch = txn.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         txn.endpoint.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || txn.type === typeFilter;
    const matchesStatus = statusFilter === "all" || txn.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Transaction Logs</h1>
        <p className="text-muted-foreground">View and search your API transaction history.</p>
      </div>

      <Card className="bg-card/50 border-border">
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4 justify-between">
            <CardTitle>All Transactions</CardTitle>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[130px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="Voice">Voice</SelectItem>
                  <SelectItem value="Verify">Verify</SelectItem>
                  <SelectItem value="Number">Number</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Transaction ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell className="font-mono text-sm">{txn.id}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{txn.type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">{txn.endpoint}</TableCell>
                  <TableCell>
                    <Badge variant={txn.status === "success" ? "default" : "destructive"}>
                      {txn.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{txn.credits}</TableCell>
                  <TableCell className="text-muted-foreground">{txn.date}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

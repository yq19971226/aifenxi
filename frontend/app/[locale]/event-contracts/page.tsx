import type { Metadata } from "next";
import EventContractsPanel from "@/components/event-contracts/EventContractsPanel";

export const metadata: Metadata = {
  title: "事件合约预测 - AXIOM",
  description: "10 分钟事件合约自动预测系统，基于订单流 + 技术指标规则引擎",
};

export default function EventContractsPage() {
  return <EventContractsPanel />;
}

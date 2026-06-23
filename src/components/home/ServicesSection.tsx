import { MessageSquare, Phone, ShieldCheck, Hash, Radio, Headphones } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const services = [
  {
    icon: MessageSquare,
    title: "SMS API",
    description: "Send and receive SMS messages globally with high deliverability rates and real-time delivery receipts.",
    features: ["Global Coverage", "Two-way Messaging", "MMS Support"]
  },
  {
    icon: Phone,
    title: "Voice API",
    description: "Build voice applications with programmable calls, IVR systems, and call recording capabilities.",
    features: ["Call Routing", "IVR Builder", "Call Recording"]
  },
  {
    icon: ShieldCheck,
    title: "Phone Verification",
    description: "Secure your users with OTP verification via SMS or voice calls for fraud prevention.",
    features: ["OTP via SMS/Voice", "Fraud Detection", "Rate Limiting"]
  },
  {
    icon: Hash,
    title: "Number Management",
    description: "Provision and manage local, toll-free, and mobile numbers across 180+ countries.",
    features: ["Local Numbers", "Toll-Free", "Number Porting"]
  },
  {
    icon: Radio,
    title: "SIP Trunking",
    description: "Connect your PBX to our global network for reliable voice communications at scale.",
    features: ["Elastic SIP", "Failover", "Call Analytics"]
  },
  {
    icon: Headphones,
    title: "Contact Center",
    description: "Power your contact center with intelligent routing, queuing, and real-time monitoring.",
    features: ["Smart Routing", "Queue Management", "Live Monitoring"]
  }
];

export function ServicesSection() {
  return (
    <section id="services" className="py-20 relative">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Our <span className="text-gradient">Services</span>
          </h2>
          <p className="text-sm text-muted-foreground">
            Comprehensive telecom APIs designed for developers, built for enterprise scale.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {services.map((service, index) => (
            <Card 
              key={service.title} 
              className="border hover:border-primary/40 transition-all duration-300 hover:shadow-md group"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CardHeader className="pb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
                  <service.icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">{service.title}</CardTitle>
                <CardDescription className="text-sm">{service.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {service.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

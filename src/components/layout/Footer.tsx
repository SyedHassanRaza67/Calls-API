import { Link } from "react-router-dom";
import { Phone, Mail, MapPin, MessageCircle } from "lucide-react";
import logoUrl from "@/assets/codebean-logo.jpg";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div className="space-y-3">
            <Link to="/" className="flex items-center gap-2">
              <img src={logoUrl} alt="Calls API" className="h-12 w-auto object-contain" />
            </Link>
            <p className="text-xs text-muted-foreground">
              Enterprise-grade API testing and telecom solutions.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-medium text-sm mb-3">Quick Links</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><Link to="/" className="hover:text-foreground transition-colors">Home</Link></li>
              <li><Link to="/agent" className="hover:text-foreground transition-colors">Agent Portal</Link></li>
              <li><Link to="/admin" className="hover:text-foreground transition-colors">Admin Dashboard</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-medium text-sm mb-3">Contact</h4>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-primary" />
                metadevelopers67@gmail.com
              </li>
              


              
              <li className="flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-primary" />
                <a href="https://wa.me/923479973407" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
                  WhatsApp: +92 347 9973407
                </a>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary mt-0.5" />
                <span>123 Tech Drive<br />San Francisco, CA 94102</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-8 pt-6 flex flex-col md:flex-row justify-between items-center gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Calls API. All rights reserved.
          </p>
          <div className="flex gap-5 text-xs text-muted-foreground">
            <Link to="#" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="#" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>);

}
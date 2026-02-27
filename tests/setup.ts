import dns from 'dns';

// Force IPv4-first DNS resolution to avoid connection issues with
// Docker containers that only bind to IPv4 (e.g., FalkorDB standalone).
// Node 22+ defaults to 'verbatim' DNS order which may try IPv6 first.
dns.setDefaultResultOrder('ipv4first');

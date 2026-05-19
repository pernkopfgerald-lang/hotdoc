FROM couchdb:3.4.2

# CouchDB muss auf IPv6 (::) lauschen, damit Fly-internal-DNS
# (hotdoc-db.internal → IPv6 6PN) den Port erreicht. "any" reicht NICHT —
# das bindet nur IPv4. Linux öffnet bei "::" automatisch dual-stack,
# also IPv4 + IPv6 auf demselben Socket.
#
# 99- als Prefix damit es ALPHABETISCH NACH dem vom Entrypoint
# generierten docker.ini geladen wird und Vorrang hat.
RUN mkdir -p /opt/couchdb/etc/local.d \
 && printf '[chttpd]\nbind_address = ::\nport = 5984\n\n[httpd]\nbind_address = ::\nport = 5984\n' \
    > /opt/couchdb/etc/local.d/99-bind.ini

EXPOSE 5984

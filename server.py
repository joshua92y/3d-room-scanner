#!/usr/bin/env python3
"""
3D 방 스캐너 로컬 서버
HTTPS 환경에서 웹 애플리케이션을 실행합니다.
"""

import http.server
import socketserver
import ssl
import os
import sys
from pathlib import Path

# 서버 설정
PORT = 8443  # HTTPS 포트
HTTP_PORT = 8000  # HTTP 포트 (개발용)

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    """CORS 헤더를 추가하는 HTTP 요청 핸들러"""
    
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()
    
    def log_message(self, format, *args):
        """요청 로그 출력"""
        print(f"[{self.date_time_string()}] {format % args}")

def create_self_signed_cert():
    """자체 서명 인증서 생성 (개발용)"""
    try:
        from cryptography import x509
        from cryptography.x509.oid import NameOID
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        import datetime
        
        # 개인 키 생성
        key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
        )
        
        # 인증서 생성
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "KR"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Seoul"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "Seoul"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "3D Room Scanner"),
            x509.NameAttribute(NameOID.COMMON_NAME, "localhost"),
        ])
        
        cert = x509.CertificateBuilder().subject_name(
            subject
        ).issuer_name(
            issuer
        ).public_key(
            key.public_key()
        ).serial_number(
            x509.random_serial_number()
        ).not_valid_before(
            datetime.datetime.utcnow()
        ).not_valid_after(
            datetime.datetime.utcnow() + datetime.timedelta(days=365)
        ).add_extension(
            x509.SubjectAlternativeName([
                x509.DNSName("localhost"),
                x509.IPAddress("127.0.0.1"),
            ]),
            critical=False,
        ).sign(key, hashes.SHA256())
        
        # 파일로 저장
        with open("cert.pem", "wb") as f:
            f.write(cert.public_bytes(serialization.Encoding.PEM))
        
        with open("key.pem", "wb") as f:
            f.write(key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ))
        
        print("✅ 자체 서명 인증서가 생성되었습니다.")
        return True
        
    except ImportError:
        print("⚠️  cryptography 패키지가 필요합니다: pip install cryptography")
        return False
    except Exception as e:
        print(f"❌ 인증서 생성 실패: {e}")
        return False

def start_https_server():
    """HTTPS 서버 시작"""
    # 인증서 파일 확인
    if not (os.path.exists("cert.pem") and os.path.exists("key.pem")):
        print("🔐 SSL 인증서를 생성합니다...")
        if not create_self_signed_cert():
            print("❌ HTTPS 서버를 시작할 수 없습니다.")
            return False
    
    try:
        # HTTPS 서버 설정
        httpd = socketserver.TCPServer(("", PORT), MyHTTPRequestHandler)
        
        # SSL 컨텍스트 생성
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.load_cert_chain("cert.pem", "key.pem")
        httpd.socket = context.wrap_socket(httpd.socket, server_side=True)
        
        print(f"🚀 HTTPS 서버가 시작되었습니다!")
        print(f"📱 브라우저에서 접속: https://localhost:{PORT}")
        print(f"⚠️  자체 서명 인증서 경고는 '고급' > '계속 진행'을 클릭하세요.")
        print(f"🛑 서버 중지: Ctrl+C")
        print("-" * 60)
        
        httpd.serve_forever()
        
    except KeyboardInterrupt:
        print("\n🛑 서버가 중지되었습니다.")
        httpd.shutdown()
        return True
    except Exception as e:
        print(f"❌ HTTPS 서버 시작 실패: {e}")
        return False

def start_http_server():
    """HTTP 서버 시작 (개발용)"""
    try:
        httpd = socketserver.TCPServer(("", HTTP_PORT), MyHTTPRequestHandler)
        
        print(f"🚀 HTTP 서버가 시작되었습니다!")
        print(f"🌐 브라우저에서 접속: http://localhost:{HTTP_PORT}")
        print(f"⚠️  카메라 기능은 HTTPS에서만 작동합니다.")
        print(f"🛑 서버 중지: Ctrl+C")
        print("-" * 60)
        
        httpd.serve_forever()
        
    except KeyboardInterrupt:
        print("\n🛑 서버가 중지되었습니다.")
        httpd.shutdown()
        return True
    except Exception as e:
        print(f"❌ HTTP 서버 시작 실패: {e}")
        return False

def main():
    """메인 함수"""
    print("=" * 60)
    print("🏠 3D 방 스캐너 로컬 서버")
    print("=" * 60)
    
    # 현재 디렉토리 확인
    current_dir = Path.cwd()
    if not (current_dir / "index.html").exists():
        print("❌ index.html 파일이 없습니다.")
        print("   3d-room-scanner 폴더에서 실행해주세요.")
        sys.exit(1)
    
    # 서버 모드 선택
    if len(sys.argv) > 1 and sys.argv[1] == "--http":
        print("🔓 HTTP 모드로 실행합니다 (개발용)")
        start_http_server()
    else:
        print("🔒 HTTPS 모드로 실행합니다 (권장)")
        if not start_https_server():
            print("\n🔄 HTTP 모드로 대체 실행합니다...")
            start_http_server()

if __name__ == "__main__":
    main()

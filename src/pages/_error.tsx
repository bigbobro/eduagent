function Error({ statusCode }: { statusCode: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#333' }}>
          {statusCode || 'Error'}
        </h1>
        <p style={{ color: '#666' }}>
          {statusCode === 404 ? '页面未找到' : '发生了错误'}
        </p>
      </div>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: { res: any; err: any }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
